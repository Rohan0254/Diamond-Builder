// Server-side Google PageSpeed Insights runs for the Dashboard.
//
// This is the JS replacement for the old PHP endpoint. Differences that are
// deliberate:
//   - It runs on the app server, never in the browser, so PAGESPEED_API_KEY is
//     never exposed to the client.
//   - The target URL comes from the `ShopProfile` collection's `primaryDomain`
//     (falling back to the stored store URL / myshopify domain, a live Admin
//     lookup, then `https://<shop>/`) — never from an arbitrary client-supplied
//     URL.
//   - Runs are persisted per shop + device so the dashboard can show a
//     "Current" run and compare it with the previous run.
//   - A run is asynchronous: "Analyze now" creates a `PageSpeedRun` row and
//     returns immediately; the Google calls happen in the background
//     (`processPageSpeedRun`) so a slow API never blocks or times out the
//     browser. The Dashboard polls the run until it is COMPLETE/FAILED, which
//     also survives a page refresh.
//
// Nothing is ever fabricated: a Google error, a timeout, a missing API key, or
// a persistence failure all surface as an explicit error instead of fake data.

import prisma from "./db.server";
import { getShopProfile } from "./shop-profile.server";
import {
  DEVICE_STRATEGIES,
  PAGESPEED_BASE_CATEGORIES,
  PAGESPEED_CATEGORIES,
  buildPageSpeedUrl,
  parsePageSpeedResponse,
  selectBaselineAndCurrent,
} from "./lib/pagespeed";

export const PAGESPEED_TIMEOUT_MS = 120000;
export const RUN_COOLDOWN_MS = 30000;
export const RUN_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };
// A run whose background worker never finished (process restart, crash, …) is
// reclaimed as failed after this long, so the Dashboard never polls forever.
export const RUN_STALE_MS = 5 * 60 * 1000;
// A finished run is surfaced to the Dashboard for this long, so a refresh right
// after completion still reports the outcome.
export const RUN_VISIBLE_MS = 15 * 60 * 1000;

// In-memory guardrails (single-instance; the DB is still the source of truth
// for the reports themselves). Mirrors the Setup page's verification gate.
const lastRunAttempt = new Map(); // shop -> timestamp
const runHistory = new Map(); // shop -> array of timestamps

/** True when a Google PageSpeed API key is configured on the server. */
export function isPageSpeedConfigured(env = process.env) {
  return Boolean(env.PAGESPEED_API_KEY && String(env.PAGESPEED_API_KEY).trim());
}

/** Normalizes a shop domain from the authenticated session. */
export function normalizeShop(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase();
}

/** Ensures a storefront URL is absolute and has a trailing slash. */
export function normalizeStorefrontUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin + "/";
  } catch {
    return "";
  }
}

function recordRunAttempt(shop) {
  const now = Date.now();
  lastRunAttempt.set(shop, now);
  const history = runHistory.get(shop) ?? [];
  history.push(now);
  runHistory.set(
    shop,
    history.filter((t) => now - t < RUN_RATE_LIMIT.windowMs),
  );
}

// Coalesces concurrent baseline ensure calls (install hook + app-shell load) so
// at most one baseline run is created per shop.
const baselineEnsures = new Map(); // shop -> Promise

/** Cooldown + sliding-window gate. Returns `{ allowed, retryAfterSeconds }`. */
export function canRunPageSpeedNow(shop, { now = Date.now() } = {}) {
  const last = lastRunAttempt.get(shop) ?? 0;
  if (now - last < RUN_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((RUN_COOLDOWN_MS - (now - last)) / 1000),
    };
  }
  const recent = (runHistory.get(shop) ?? []).filter(
    (t) => now - t < RUN_RATE_LIMIT.windowMs,
  );
  if (recent.length >= RUN_RATE_LIMIT.max) {
    return { allowed: false, retryAfterSeconds: RUN_RATE_LIMIT.windowMs / 1000 };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Resolves the storefront URL to test. The `ShopProfile` collection is the
 * source of truth: its `primaryDomain` is the store's website URL, with the
 * stored store URL / myshopify domain as fallbacks. When no profile exists yet
 * (e.g. an install that predates profile capture), it falls back to a live
 * Admin API lookup and finally the session's myshopify domain. The client never
 * supplies this URL.
 */
export async function getStorefrontUrl(admin, shop) {
  const domain = normalizeShop(shop);

  // 1. Stored profile — `primaryDomain` is the merchant's storefront URL.
  try {
    const profile = await getShopProfile(shop);
    const stored =
      normalizeStorefrontUrl(profile?.primaryDomain) ||
      normalizeStorefrontUrl(profile?.storeUrl) ||
      normalizeStorefrontUrl(profile?.myshopifyDomain);
    if (stored) return stored;
  } catch (error) {
    console.error("[pagespeed.server] stored storefront lookup failed", error);
  }

  // 2. Live Admin API lookup (covers shops with no stored profile yet).
  if (admin?.graphql) {
    try {
      const response = await admin.graphql(
        `#graphql
        query SpeedScratcherStorefront {
          shop {
            myshopifyDomain
            primaryDomain {
              url
            }
          }
        }`,
      );
      const payload = await response.json();
      const shopInfo = payload?.data?.shop ?? {};
      const resolved =
        normalizeStorefrontUrl(shopInfo.primaryDomain?.url) ||
        normalizeStorefrontUrl(shopInfo.myshopifyDomain);
      if (resolved) return resolved;
    } catch (error) {
      console.error("[pagespeed.server] storefront lookup failed", error);
    }
  }

  // 3. Last resort — the shop's myshopify domain from the session.
  return domain ? `https://${domain}/` : "";
}

/** One PageSpeed request. Returns `{ status, json }`; never throws for HTTP. */
async function requestPageSpeed({ url, device, apiKey, categories }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);
  try {
    const response = await fetch(
      buildPageSpeedUrl({ url, device, apiKey, categories }),
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches + parses one device. Never throws.
 *
 * The requested categories include Agentic Browsing (Lighthouse 13.3+). If an
 * older API revision rejects that value (HTTP 400) the request is retried once
 * with the four documented categories, so Accessibility / Best Practices / SEO
 * are never lost because of it.
 */
async function fetchPageSpeedForDevice({ url, device, apiKey }) {
  try {
    let { status, json } = await requestPageSpeed({
      url,
      device,
      apiKey,
      categories: PAGESPEED_CATEGORIES,
    });
    if (status === 400) {
      ({ status, json } = await requestPageSpeed({
        url,
        device,
        apiKey,
        categories: PAGESPEED_BASE_CATEGORIES,
      }));
    }
    if (!json) {
      return {
        ok: false,
        device,
        error: `PageSpeed Insights returned an unreadable response (HTTP ${status}).`,
      };
    }
    const parsed = parsePageSpeedResponse(json, { device });
    return parsed.ok
      ? { ok: true, device, report: parsed.report }
      : { ok: false, device, error: parsed.error };
  } catch (error) {
    const timeout = error?.name === "AbortError";
    return {
      ok: false,
      device,
      error: timeout
        ? "PageSpeed test timed out (API timeout). Please try again."
        : `Could not reach PageSpeed Insights: ${error?.message ?? error}`,
    };
  }
}

/** Strips the raw JSON + screenshot before persisting (keeps documents small). */
function toStoredReport(report) {
  if (!report || typeof report !== "object") return {};
  const rest = { ...report };
  delete rest.rawJson;
  delete rest.screenshot;
  return rest;
}

async function persistReport({ shop, device, url, report, isBaseline = false }) {
  const captured =
    report?.capturedAt && !Number.isNaN(new Date(report.capturedAt).getTime())
      ? new Date(report.capturedAt)
      : new Date();
  return prisma.pageSpeedReport.create({
    data: {
      shop,
      device,
      url,
      capturedAt: captured,
      isBaseline,
      report: toStoredReport(report),
    },
  });
}

/** True while a run is still being processed. */
export function isActiveRunStatus(status) {
  return status === "PENDING" || status === "RUNNING";
}

/** Serializable run view for the Dashboard (never leaks internals). */
function serializeRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    url: run.url ?? null,
    devices: run.devices ?? null,
    error: run.error ?? null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  };
}

/**
 * The run state the Dashboard should show for a shop: the most recent run while
 * it is still active or only recently finished, otherwise null. A run whose
 * worker died is reclaimed as FAILED so polling always terminates. Never throws.
 */
export async function getRunState(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return null;

  let run = null;
  try {
    run = await prisma.pageSpeedRun.findFirst({
      where: { shop: domain },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    // A DB error must never 500 the dashboard.
    console.error("[pagespeed.server] failed to load run state", error);
    return null;
  }
  if (!run) return null;

  // Reclaim a run whose worker never finished (process restart, crash, …).
  if (
    isActiveRunStatus(run.status) &&
    Date.now() - new Date(run.startedAt).getTime() > RUN_STALE_MS
  ) {
    try {
      run = await prisma.pageSpeedRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: "The PageSpeed test timed out. Please try again.",
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("[pagespeed.server] failed to reclaim stale run", error);
    }
  }

  // Don't surface ancient runs (avoids re-notifying on later page loads).
  if (Date.now() - new Date(run.createdAt).getTime() > RUN_VISIBLE_MS) {
    return null;
  }
  return serializeRun(run);
}

/**
 * Starts a PageSpeed run and returns immediately — the actual Google calls run
 * in the background (`processPageSpeedRun`) so a slow API never blocks or times
 * out the merchant's browser. The run is persisted, so it survives a refresh.
 *
 * @param {object} args
 * @param {boolean} [args.isBaseline] Marks the automatic install-time "before
 *   speed" capture. Every report it stores is tagged `isBaseline` so the
 *   Dashboard loads it only in the Before section. Defaults to `false`.
 * @returns {Promise<{ok: boolean, run?: object, reused?: boolean, error?: string}>}
 */
export async function startPageSpeedRun({
  shop,
  admin,
  env = process.env,
  isBaseline = false,
}) {
  const domain = normalizeShop(shop);
  if (!domain) {
    return { ok: false, error: "The shop could not be identified." };
  }

  const apiKey = String(env.PAGESPEED_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "PageSpeed testing is not configured. Set PAGESPEED_API_KEY in the server environment and redeploy.",
    };
  }

  // Reuse a run that is already in flight (getRunState also reclaims stale runs).
  const existing = await getRunState(domain);
  if (existing && isActiveRunStatus(existing.status)) {
    return { ok: true, run: existing, reused: true };
  }

  const gate = canRunPageSpeedNow(domain);
  if (!gate.allowed) {
    return {
      ok: false,
      error: `Please wait ${gate.retryAfterSeconds}s before running another PageSpeed test.`,
    };
  }

  // Resolve the URL now, while the request's admin context is still alive — the
  // background worker must not depend on the request-scoped `admin` client.
  const url = await getStorefrontUrl(admin, domain);
  if (!url) {
    return { ok: false, error: "The store's website URL could not be resolved." };
  }

  recordRunAttempt(domain);

  let run;
  try {
    run = await prisma.pageSpeedRun.create({
      data: { shop: domain, status: "PENDING", url, isBaseline },
    });
  } catch (error) {
    console.error("[pagespeed.server] failed to create run", error);
    return {
      ok: false,
      error: "The PageSpeed test could not be started. Please try again.",
    };
  }

  // Fire-and-forget: respond now, keep working in the background.
  processPageSpeedRun({
    runId: run.id,
    shop: domain,
    url,
    apiKey,
    isBaseline,
  }).catch((error) => {
    console.error("[pagespeed.server] background run crashed", error);
  });

  return { ok: true, run: serializeRun(run) };
}

/**
 * The background worker: fetches both devices, persists each success and marks
 * the run COMPLETE/FAILED. Never throws.
 */
export async function processPageSpeedRun({
  runId,
  shop,
  url,
  apiKey,
  isBaseline = false,
}) {
  try {
    await prisma.pageSpeedRun.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    });
  } catch (error) {
    console.error("[pagespeed.server] failed to mark run RUNNING", error);
  }

  const results = await Promise.all(
    DEVICE_STRATEGIES.map((device) =>
      fetchPageSpeedForDevice({ url, device, apiKey }),
    ),
  );

  const devices = {};
  for (const result of results) {
    if (!result.ok) {
      devices[result.device] = { ok: false, error: result.error };
      continue;
    }
    try {
      await persistReport({
        shop,
        device: result.device,
        url,
        report: result.report,
        isBaseline,
      });
      devices[result.device] = { ok: true, capturedAt: result.report.capturedAt ?? null };
    } catch (error) {
      console.error("[pagespeed.server] failed to persist report", error);
      devices[result.device] = {
        ok: false,
        error: "The PageSpeed report could not be saved. Please try again.",
      };
    }
  }

  const anyOk = Object.values(devices).some((result) => result.ok);
  const firstError =
    results.find((result) => !result.ok)?.error ??
    "The PageSpeed test did not return any results. Please try again.";

  try {
    await prisma.pageSpeedRun.update({
      where: { id: runId },
      data: {
        status: anyOk ? "COMPLETE" : "FAILED",
        devices,
        error: anyOk ? null : firstError,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[pagespeed.server] failed to finalize run", error);
  }

  return { ok: anyOk, devices };
}

/** True once at least one PageSpeed report has been stored for the shop. Never throws. */
export async function hasStoredReport(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return false;
  try {
    const report = await prisma.pageSpeedReport.findFirst({
      where: { shop: domain },
      select: { id: true },
    });
    return Boolean(report);
  } catch (error) {
    console.error("[pagespeed.server] failed to check stored reports", error);
    return false;
  }
}

/** True when any run (of any status) exists for the shop. Never throws. */
async function hasAnyRun(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return false;
  try {
    const run = await prisma.pageSpeedRun.findFirst({
      where: { shop: domain },
      select: { id: true },
    });
    return Boolean(run);
  } catch (error) {
    console.error("[pagespeed.server] failed to check runs", error);
    return false;
  }
}

/**
 * Ensures the automatic "before speed" baseline run exists for a shop.
 *
 * Wired to install (`afterAuth`) and to every app-shell load, so the merchant's
 * pre-install speed is captured without any action — before the app's script is
 * ever added. It starts at most one run per shop until a report exists: an
 * unconfigured API key, an existing report, or an already-created run all
 * short-circuit. Never throws.
 *
 * @returns {Promise<{ok: boolean, skipped?: string, run?: object, error?: string}>}
 */
export function ensureBaselinePageSpeedRun({ shop, admin, env = process.env } = {}) {
  const domain = normalizeShop(shop);
  if (!domain) return Promise.resolve({ ok: false, skipped: "no-shop" });
  // Coalesce concurrent calls (the install hook and an app-shell/setup load can
  // fire together) so at most one baseline run is created per shop.
  const inFlight = baselineEnsures.get(domain);
  if (inFlight) return inFlight;
  const promise = runEnsureBaselinePageSpeedRun({ shop: domain, admin, env }).finally(
    () => {
      baselineEnsures.delete(domain);
    },
  );
  baselineEnsures.set(domain, promise);
  return promise;
}

async function runEnsureBaselinePageSpeedRun({ shop, admin, env = process.env } = {}) {
  try {
    if (!isPageSpeedConfigured(env)) return { ok: false, skipped: "unconfigured" };
    // The baseline already exists — nothing to do (later runs are manual or the
    // browser's "Analyze now").
    if (await hasStoredReport(shop)) return { ok: true, skipped: "have-report" };
    // A run was already created (in flight, or finished/failed). Don't loop.
    if (await hasAnyRun(shop)) return { ok: true, skipped: "existing-run" };
    // Tag every report this run stores as the fixed "Before" baseline.
    return await startPageSpeedRun({ shop, admin, env, isBaseline: true });
  } catch (error) {
    console.error("[pagespeed.server] ensure baseline failed", error);
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Reads the reports per device for the Dashboard:
 *
 *   - `baseline` (Before) is the report explicitly marked `isBaseline` — the
 *     automatic "before speed" run recorded at install. It is fixed: later runs
 *     never replace it. Reports written before the marker existed have no flag,
 *     so the earliest report is used as a fallback.
 *   - `current` (Current / after) is the LATEST report for the device. When the
 *     only report is the baseline itself, `current` is `null` so the install
 *     score is shown under Before only.
 *
 * Any device without a report gets `null`, so the UI can show a neutral "not
 * available" state instead of a fabricated comparison.
 *
 * @returns {Promise<{current: {mobile: object|null, desktop: object|null},
 *   baseline: {mobile: object|null, desktop: object|null}}>}
 */
export async function getLatestReports(shop) {
  const domain = normalizeShop(shop);
  const result = {
    current: { mobile: null, desktop: null },
    baseline: { mobile: null, desktop: null },
  };
  if (!domain) return result;

  for (const device of DEVICE_STRATEGIES) {
    try {
      const [baselineRow, earliestRow, latestRow] = await Promise.all([
        // The earliest report explicitly marked as the install-time baseline.
        prisma.pageSpeedReport.findFirst({
          where: { shop: domain, device, isBaseline: true },
          orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
          select: { id: true, report: true },
        }),
        // Fallbacks for reports written before the `isBaseline` marker existed.
        prisma.pageSpeedReport.findFirst({
          where: { shop: domain, device },
          orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
          select: { id: true, report: true },
        }),
        prisma.pageSpeedReport.findFirst({
          where: { shop: domain, device },
          orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, report: true },
        }),
      ]);
      const picked = selectBaselineAndCurrent({ baselineRow, earliestRow, latestRow });
      // The install-time capture is the fixed "Before" baseline.
      result.baseline[device] = picked.baseline;
      // "Current" is the most recent run — but never the baseline itself, so a
      // shop with only the install capture shows it under Before only.
      result.current[device] = picked.current;
    } catch (error) {
      // A DB/collection error must never 500 the dashboard.
      console.error("[pagespeed.server] failed to load reports", error);
      result.current[device] = null;
      result.baseline[device] = null;
    }
  }

  return result;
}

/** How many days of report history the dashboard loads for the chart. */
export const REPORT_HISTORY_DAYS = 30;

/**
 * Loads the stored report history for the chart, per device, oldest first.
 *
 * Returns every report captured in the last `days` days so the client can slice
 * the 7/15/30-day range filter without another round trip. Reports written
 * before the normalized shape existed are returned as-is — the UI treats a
 * missing field as "not available", never as zero. Never throws.
 *
 * @returns {Promise<{mobile: object[], desktop: object[]}>} arrays of
 *   normalized reports (each with its authoritative `capturedAt` timestamp).
 */
export async function getReportHistory(shop, { days = REPORT_HISTORY_DAYS, now = new Date() } = {}) {
  const domain = normalizeShop(shop);
  const result = { mobile: [], desktop: [] };
  if (!domain) return result;

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  for (const device of DEVICE_STRATEGIES) {
    try {
      const rows = await prisma.pageSpeedReport.findMany({
        where: { shop: domain, device, capturedAt: { gte: cutoff } },
        orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
        select: { report: true, capturedAt: true, isBaseline: true },
      });
      result[device] = rows.map((row) => ({
        ...(row.report && typeof row.report === "object" ? row.report : {}),
        // The column is the ordering key, so it is the authoritative date.
        capturedAt: row.capturedAt.toISOString(),
        isBaseline: Boolean(row.isBaseline),
      }));
    } catch (error) {
      // A DB error must never 500 the dashboard — the chart just falls back.
      console.error("[pagespeed.server] failed to load report history", error);
      result[device] = [];
    }
  }

  return result;
}
