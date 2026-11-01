// Server-side setup verification for Diamond Builder.
//
// Verification reads TWO independent sources and reports honestly:
//   1. The live (MAIN) theme's files, read through the Admin GraphQL API
//      (requires the `read_themes` scope). This is the authoritative check —
//      the script the merchant pasted into theme.liquid is found even when the
//      storefront is password-protected, cached, or behind a CDN.
//   2. The shop's public storefront HTML (best-effort fallback, works without
//      the extra scope).
//
// The shop is always derived from the authenticated session, never from the
// client. Nothing is fabricated: a marker found anywhere is "verified", a
// marker found nowhere is "not detected", and when neither source can be read
// the result is "unable to verify" — never a false pass or a false failure.
//
// Results are persisted to MongoDB keyed by shop with a verification timestamp.

import prisma from "./db.server";
import {
  SCRIPT_MARKERS,
  extractScriptSrc,
  getPublicScripts,
  isScriptKey,
} from "./lib/scripts";
import {
  computeOverallStatus,
  detectPasswordPage,
  verifyScriptsAcrossSources,
} from "./lib/verify";

export const STOREFRONT_FETCH_TIMEOUT_MS = 10000;
export const VERIFY_COOLDOWN_MS = 30000;
export const VERIFY_RATE_LIMIT = { max: 6, windowMs: 5 * 60 * 1000 };

// Theme reading is bounded so a huge theme can never make verification hang or
// blow up memory. Only text-ish files can contain a script tag.
export const THEME_MAX_FILES = 250;
export const THEME_FILE_BATCH_SIZE = 50; // API allows at most 50 filenames/req
const TEXT_THEME_FILE_PATTERN = /\.(liquid|json)$/i;

// In-memory guardrails. Single-instance only; if the app ever runs on multiple
// instances these become best-effort (the DB record itself is still
// authoritative per the latest verification timestamp).
const lastVerifyAttempt = new Map(); // shop -> timestamp
const verifyHistory = new Map(); // shop -> array of timestamps

/** Reads the script definitions using the server environment. */
export function getScriptDefinitions(env = process.env) {
  return getPublicScripts({
    optimizationUrl: env.SPEED_SCRATCHER_OPTIMIZATION_SCRIPT_URL || "",
  });
}

/** Normalizes a shop domain from the authenticated session. */
export function normalizeShop(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Fetches the shop's public storefront HTML from the server. Never trusts the
 * browser: the URL is built from the authenticated `shop` domain only.
 *
 * @returns {Promise<{ok:boolean, status:number, html:string, error?:string}>}
 */
export async function fetchStorefrontHtml(shop) {
  const domain = normalizeShop(shop);
  if (!domain) {
    return { ok: false, status: 0, html: "", error: "Missing shop domain." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STOREFRONT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${domain}/`, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Speed-Scratcher-Verification/1.0 (+https://diamond-builder.onrender.com)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text();
    return { ok: response.ok, status: response.status, html };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      html: "",
      error: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- theme read

const MAIN_THEME_QUERY = `#graphql
  query SpeedScratcherMainTheme {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
      }
    }
  }`;

const THEME_FILE_LIST_QUERY = `#graphql
  query SpeedScratcherThemeFiles($id: ID!, $after: String) {
    theme(id: $id) {
      files(first: 250, after: $after) {
        nodes {
          filename
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`;

const THEME_FILE_CONTENT_QUERY = `#graphql
  query SpeedScratcherThemeFileContent($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(first: 50, filenames: $filenames) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText {
              content
            }
          }
        }
      }
    }
  }`;

/** Maps a GraphQL error (array, Error, or error body) to a stable reason code. */
function classifyThemeError(input) {
  let text = "";
  if (Array.isArray(input)) {
    text = input.map((entry) => entry?.message ?? "").join(" ");
  } else if (Array.isArray(input?.body?.errors)) {
    text = input.body.errors.map((entry) => entry?.message ?? "").join(" ");
  } else {
    text = String(input?.message ?? input ?? "");
  }
  if (/access denied|not approved|unauthorized|read_themes|scope/i.test(text)) {
    return "missing-scope";
  }
  return "error";
}

async function runGraphql(admin, query, variables) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return response.json();
}

/** Paginated list of every filename in the theme. */
async function listThemeFilenames(admin, themeId) {
  const filenames = [];
  let after = null;
  for (let page = 0; page < 10; page += 1) {
    const payload = await runGraphql(admin, THEME_FILE_LIST_QUERY, {
      id: themeId,
      after,
    });
    const connection = payload?.data?.theme?.files;
    if (!connection) break;
    for (const node of connection.nodes ?? []) {
      if (node?.filename) filenames.push(node.filename);
    }
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return filenames;
}

/** Fetches text content for the given filenames, in batches of <= 50. */
async function fetchThemeFileBatch(admin, themeId, filenames) {
  const payload = await runGraphql(admin, THEME_FILE_CONTENT_QUERY, {
    id: themeId,
    filenames,
  });
  const nodes = payload?.data?.theme?.files?.nodes ?? [];
  const files = [];
  for (const node of nodes) {
    const content = node?.body?.content;
    if (typeof content === "string") {
      files.push({ filename: node.filename, content });
    }
  }
  return files;
}

/**
 * Fetches text file contents in batches, stopping as soon as any script marker
 * is found. `theme.liquid` is read first (the documented paste location), so
 * the common case is a single small request.
 */
async function fetchThemeFileContents(admin, themeId, filenames) {
  const markers = Object.values(SCRIPT_MARKERS);
  const files = [];
  let found = false;
  const limited = filenames.slice(0, THEME_MAX_FILES);
  for (let i = 0; i < limited.length && !found; i += THEME_FILE_BATCH_SIZE) {
    const batch = limited.slice(i, i + THEME_FILE_BATCH_SIZE);
    const page = await fetchThemeFileBatch(admin, themeId, batch);
    for (const entry of page) {
      files.push(entry);
      if (markers.some((marker) => entry.content.includes(marker))) {
        found = true;
      }
    }
  }
  return files;
}

/**
 * Reads the published (MAIN) theme's text files through the Admin API.
 *
 * Never throws. Returns `{ ok: true, theme, files }` on success or
 * `{ ok: false, reason }` where reason is one of `no-admin` | `missing-scope` |
 * `no-main-theme` | `error`.
 */
export async function readMainThemeFiles(admin) {
  if (!admin?.graphql) return { ok: false, reason: "no-admin" };

  try {
    const themePayload = await runGraphql(admin, MAIN_THEME_QUERY);
    if (Array.isArray(themePayload?.errors) && themePayload.errors.length) {
      return { ok: false, reason: classifyThemeError(themePayload.errors) };
    }
    const theme = themePayload?.data?.themes?.nodes?.[0];
    if (!theme?.id) return { ok: false, reason: "no-main-theme" };

    const filenames = await listThemeFilenames(admin, theme.id);
    const textFilenames = filenames
      .filter((name) => TEXT_THEME_FILE_PATTERN.test(name))
      // Read the documented paste location first so a normal install verifies
      // in a single small request.
      .sort((a, b) => {
        const priority = (name) => (name === "layout/theme.liquid" ? 0 : 1);
        return priority(a) - priority(b);
      })
      .slice(0, THEME_MAX_FILES);
    const files = await fetchThemeFileContents(admin, theme.id, textFilenames);

    return {
      ok: true,
      theme: { id: theme.id, name: theme.name ?? null },
      files,
    };
  } catch (error) {
    console.error("[setup.server] could not read theme files", error);
    return { ok: false, reason: classifyThemeError(error) };
  }
}

/** Human-readable reason for why the theme could not be read. */
function themeReasonMessage(reason) {
  switch (reason) {
    case "missing-scope":
      return "the app does not have the read_themes permission yet (re-install the app to grant it)";
    case "no-main-theme":
      return "no published (main) theme was found";
    case "no-admin":
      return "the Admin API is unavailable in this request";
    default:
      return "the theme could not be read";
  }
}

/** Description of the sources a verification attempt actually checked. */
function buildSources({ themeRead, fetched, passwordPage, storefrontChecked }) {
  return {
    themeRead: Boolean(themeRead?.ok),
    themeName: themeRead?.ok ? themeRead.theme?.name ?? null : null,
    themeReason: themeRead?.ok ? null : themeRead?.reason ?? "error",
    storefrontChecked,
    storefrontStatus: fetched?.status ?? 0,
    passwordPage: Boolean(passwordPage),
  };
}

function buildUnableMessage({ themeRead, fetched, passwordPage }) {
  const storefront = fetched?.status
    ? `the storefront returned HTTP ${fetched.status}`
    : `the storefront was unreachable (${fetched?.error || "no response"})`;
  if (passwordPage) {
    return `The storefront is password protected and ${themeReasonMessage(
      themeRead?.reason,
    )}. Grant the read_themes scope (re-install the app) or make the storefront public, then verify again.`;
  }
  return `Could not verify: ${themeReasonMessage(
    themeRead?.reason,
  )} and ${storefront}.`;
}

/** Serializable view of a verification record for the browser. */
export function serializeSetupVerification(record) {
  if (!record) return null;
  return {
    overallStatus: record.overallStatus,
    scripts: record.scripts,
    verifiedAt: record.lastVerifiedAt,
  };
}

/** Latest persisted verification for a shop, or null when none exists. */
export async function getLatestSetupVerification(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return null;
  return prisma.setupVerification.findFirst({
    where: { shop: domain },
    orderBy: { lastVerifiedAt: "desc" },
  });
}

/** Merges a persisted-or-fresh verification record with its sources. */
function serializeResult({ overallStatus, scripts, verifiedAt, sources }) {
  return {
    overallStatus,
    scripts,
    verifiedAt,
    sources,
  };
}

function recordRun(shop) {
  const now = Date.now();
  lastVerifyAttempt.set(shop, now);
  const history = verifyHistory.get(shop) ?? [];
  history.push(now);
  verifyHistory.set(
    shop,
    history.filter((t) => now - t < VERIFY_RATE_LIMIT.windowMs),
  );
}

/**
 * Checks the cooldown + sliding-window guardrails before a verification
 * attempt. Returns `{ allowed, retryAfterSeconds }`.
 */
export function canVerifyNow(shop, { now = Date.now() } = {}) {
  const last = lastVerifyAttempt.get(shop) ?? 0;
  if (now - last < VERIFY_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((VERIFY_COOLDOWN_MS - (now - last)) / 1000),
    };
  }
  const history = verifyHistory.get(shop) ?? [];
  if (history.filter((t) => now - t < VERIFY_RATE_LIMIT.windowMs).length >= VERIFY_RATE_LIMIT.max) {
    return { allowed: false, retryAfterSeconds: VERIFY_RATE_LIMIT.windowMs / 1000 };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Runs a verification against the live theme files and the storefront HTML.
 *
 * @param {string} shop authenticated shop domain
 * @param {{admin?: {graphql: Function}}} [options]
 * @returns {Promise<{ok:boolean, setup?:object, sources?:object, error?:string}>}
 */
export async function runSetupVerification(shop, { admin } = {}) {
  const domain = normalizeShop(shop);
  if (!domain) {
    return { ok: false, error: "Missing shop domain." };
  }

  recordRun(domain);

  // Require the configured URL as well as the marker when verifying a live script.
  const setupScripts = getScriptDefinitions();
  const scripts = setupScripts.map((script) => ({
    key: script.key,
    src: extractScriptSrc(script.script),
  }));

  const [themeRead, fetched] = await Promise.all([
    readMainThemeFiles(admin),
    fetchStorefrontHtml(domain),
  ]);

  const passwordPage = fetched.ok && detectPasswordPage(fetched.html);
  const storefrontChecked = fetched.ok && !passwordPage;
  const themeAvailable = Boolean(themeRead.ok);

  const results = verifyScriptsAcrossSources({
    scripts,
    markers: SCRIPT_MARKERS,
    themeAvailable,
    themeFiles: themeAvailable ? themeRead.files : [],
    html: fetched.html,
    storefrontChecked,
    unableMessage: buildUnableMessage({ themeRead, fetched, passwordPage }),
  });

  const sources = buildSources({
    themeRead,
    fetched,
    passwordPage,
    storefrontChecked,
  });

  const anySourceChecked = themeAvailable || storefrontChecked;
  const overallStatus = computeOverallStatus({
    fetchOk: anySourceChecked,
    passwordPage: passwordPage && !themeAvailable,
    results,
  });

  const now = new Date();

  try {
    const record = await prisma.setupVerification.create({
      data: { shop: domain, scripts: results, overallStatus, lastVerifiedAt: now },
    });
    return {
      ok: true,
      setup: serializeResult({
        overallStatus: record.overallStatus,
        scripts: record.scripts,
        verifiedAt: record.lastVerifiedAt,
        sources,
      }),
      sources,
    };
  } catch (error) {
    // A persistence failure must never turn into a false result — return the
    // freshly-computed status (and flag that it wasn't saved).
    console.error("[setup.server] failed to save verification", error);
    return {
      ok: true,
      persisted: false,
      setup: serializeResult({
        overallStatus,
        scripts: results,
        verifiedAt: now,
        sources,
      }),
      sources,
    };
  }
}

/** Strict check for script keys coming from the client. */
export function isValidScriptKey(key) {
  return isScriptKey(key);
}
