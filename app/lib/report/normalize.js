// Google PageSpeed Insights → normalized report adapter.
//
// This is the single place that maps the raw Google JSON into the internal
// normalized model the Home dashboard renders. It is implemented now so that,
// when the real report JSON is available, wiring it up is just a matter of
// calling `mapPageSpeedInsightsReport(psiJson, { device })` — the UI and the
// fixtures already speak the normalized shape and need no redesign.
//
// Nothing in this module assumes every PSI response contains every field:
// missing categories, audits and metrics become `null`/empty, never crashes,
// and never produce fabricated numbers.

import { metricEntry } from "./model.js";
import { SEO_AUDIT_IDS } from "./seo.js";

/** Maps metric keys in the normalized model to Lighthouse audit ids. */
export const METRIC_AUDIT_KEYS = {
  firstContentfulPaint: "first-contentful-paint",
  largestContentfulPaint: "largest-contentful-paint",
  totalBlockingTime: "total-blocking-time",
  cumulativeLayoutShift: "cumulative-layout-shift",
  speedIndex: "speed-index",
};

/**
 * Converts a Lighthouse audit (0..1 score category) into a 0..100 score,
 * or `null` when absent.
 */
function toScore100(category) {
  const score = category?.score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.round(score * 100);
}

/** Rounds to a fixed number of decimals (avoiding floating-point noise). */
function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Reads a metric from the audits object; converts Lighthouse ms to seconds. */
function metricFromAudit(audits, auditKey, { fromMs = true, decimals = 1, unit } = {}) {
  const audit = audits?.[auditKey];
  const numeric = audit?.numericValue;
  const resolvedUnit = unit ?? (fromMs ? "s" : "");
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return metricEntry(null, resolvedUnit);
  }
  const value = fromMs ? roundTo(numeric / 1000, decimals) : roundTo(numeric, decimals);
  return metricEntry(value, resolvedUnit);
}

/** Extracts the full-page screenshot data URI, if present. */
function screenshotFrom(result) {
  const data = result?.fullPageScreenshot?.screenshot?.data;
  return typeof data === "string" && data ? data : null;
}

/** Turns `overallSavingsMs` into a compact "0.4 s" label, or null. */
export function savingsLabel(overallSavingsMs) {
  if (typeof overallSavingsMs !== "number" || !Number.isFinite(overallSavingsMs)) {
    return null;
  }
  if (overallSavingsMs >= 1000) return `${roundTo(overallSavingsMs / 1000, 1)} s`;
  return `${Math.round(overallSavingsMs)} ms`;
}

/** Sorts audit-like items by title for stable output. */
function byTitle(a, b) {
  return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
}

/**
 * Derives the Agentic Browsing pass ratio. Unlike the other categories this one
 * has no 0–100 score — PageSpeed returns a fraction plus per-audit pass/fail
 * results. We count only the audits that actually applied to the page (audits
 * reported as not applicable / informative / manual, or with a null score, are
 * dropped), which mirrors how the PageSpeed UI shows e.g. "3/3 checks passed".
 *
 * @param {object} categories `lighthouseResult.categories`
 * @param {object} audits `lighthouseResult.audits`
 * @returns {{passed: number, total: number}}
 */
export function agenticBrowsingFrom(categories, audits) {
  const category = categories?.["agentic-browsing"];
  if (!category) return { passed: 0, total: 0 };

  const refs = Array.isArray(category.auditRefs) ? category.auditRefs : [];
  let passed = 0;
  let total = 0;
  for (const ref of refs) {
    const audit = audits?.[ref?.id];
    if (!audit) continue;
    const mode = audit.scoreDisplayMode ?? "";
    if (mode === "notApplicable" || mode === "informative" || mode === "manual") {
      continue;
    }
    if (typeof audit.score !== "number") continue;
    total += 1;
    if (audit.score >= 1) passed += 1;
  }
  return { passed, total };
}

/** Cap on the items kept per SEO audit (keeps the stored document small). */
export const SEO_AUDIT_ITEM_LIMIT = 25;

/** First non-empty trimmed string of the candidates, or `null`. */
function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Pulls the displayable URL/label out of one Lighthouse audit item.
 *
 * Lighthouse item shapes differ per audit (node audits nest everything under
 * `node`, table/opportunity audits carry `url`/`href`), so every candidate is
 * optional and a missing field simply stays `null`.
 */
function seoAuditItem(item) {
  const node = item?.node ?? {};
  return {
    url: firstText(item?.url, item?.href, item?.source?.url),
    label: firstText(node.nodeLabel, node.selector, node.snippet),
  };
}

/**
 * Extracts the audits the SEO & Site Health panel reads.
 *
 * Only the audit ids in `SEO_AUDIT_IDS` are kept, each with its score, the true
 * item count and a bounded sample of items, so the panel can show real counts
 * and affected URLs without persisting the whole Lighthouse JSON. Returns
 * `null` when the response carries no audits at all, so the panel reports
 * "Not scanned" instead of a fabricated result.
 */
export function seoAuditsFrom(result) {
  const audits = result?.audits;
  if (!audits || typeof audits !== "object") return null;

  const kept = {};
  for (const id of Object.values(SEO_AUDIT_IDS)) {
    const audit = audits[id];
    if (!audit) continue;
    const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
    kept[id] = {
      score: typeof audit.score === "number" ? audit.score : null,
      scoreDisplayMode: audit.scoreDisplayMode ?? null,
      itemCount: items.length,
      items: items.slice(0, SEO_AUDIT_ITEM_LIMIT).map(seoAuditItem),
    };
  }
  return { scannedAt: result?.fetchTime ?? null, audits: kept };
}

/**
 * Maps a raw PageSpeed Insights JSON response into a normalized report.
 *
 * @param {object} psi  The raw response (either the full envelope with
 *   `lighthouseResult`, or the bare `lighthouseResult`).
 * @param {object} [options]
 * @param {"mobile"|"desktop"} [options.device]
 * @returns {object} Normalized report (same shape as the fixtures).
 */
export function mapPageSpeedInsightsReport(psi, { device = "mobile" } = {}) {
  const result = psi?.lighthouseResult ?? psi ?? null;
  const categories = result?.categories ?? {};
  const audits = result?.audits ?? {};
  const auditList = Object.values(audits);

  const isOpportunity = (audit) => {
    const details = audit?.details ?? {};
    return details?.type === "opportunity" || typeof details?.overallSavingsMs === "number";
  };

  // Informational audits carry a score only for context and must never be shown
  // as a pass/fail result.
  const isInformative = (audit) => Boolean(audit?.scoreDisplayMode?.includes("informative"));

  const opportunities = auditList
    .filter((audit) => isOpportunity(audit))
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      savings: savingsLabel(audit.details?.overallSavingsMs),
      description: audit.description ?? "",
    }))
    .sort(byTitle);

  const diagnostics = auditList
    .filter(
      (audit) =>
        typeof audit.score === "number" &&
        audit.score < 1 &&
        !isOpportunity(audit) &&
        !isInformative(audit),
    )
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      score: audit.score,
      description: audit.description ?? "",
    }))
    .sort(byTitle);

  const passedAudits = auditList
    .filter((audit) => audit.score === 1 && !isInformative(audit))
    .map((audit) => ({ id: audit.id, title: audit.title }))
    .sort(byTitle);

  return {
    device,
    capturedAt: result?.fetchTime ?? null,
    source: "pagespeed-insights",
    scores: {
      performance: toScore100(categories.performance),
      accessibility: toScore100(categories.accessibility),
      bestPractices: toScore100(categories["best-practices"]),
      seo: toScore100(categories.seo),
    },
    agenticBrowsing: agenticBrowsingFrom(categories, audits),
    metrics: {
      firstContentfulPaint: metricFromAudit(audits, "first-contentful-paint", { fromMs: true, decimals: 1 }),
      largestContentfulPaint: metricFromAudit(audits, "largest-contentful-paint", { fromMs: true, decimals: 1 }),
      totalBlockingTime: metricFromAudit(audits, "total-blocking-time", { fromMs: false, decimals: 0, unit: "ms" }),
      cumulativeLayoutShift: metricFromAudit(audits, "cumulative-layout-shift", { fromMs: false, decimals: 2 }),
      speedIndex: metricFromAudit(audits, "speed-index", { fromMs: true, decimals: 1 }),
    },
    screenshot: screenshotFrom(result),
    opportunities,
    diagnostics,
    passedAudits,
    // The audits behind the SEO & Site Health panel (`null` when the response
    // carries none, so the panel says "not scanned" instead of guessing).
    seoAudits: seoAuditsFrom(result),
    // Preserve the raw JSON so future audit mapping/debugging never needs to
    // re-fetch it.
    rawJson: psi ?? null,
  };
}