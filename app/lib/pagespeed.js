// Google PageSpeed Insights integration — pure helpers.
//
// This is the JavaScript port of the original PHP endpoint. It contains the
// deterministic parts only (build the v5/runPagespeed URL, turn the raw Google
// JSON into the app's normalized report model, derive the two coarse status
// labels the PHP returned). No network, no env vars, no secrets, so it is
// fully unit-testable and can never leak the API key.

import { mapPageSpeedInsightsReport } from "./report/normalize.js";

/** The Google PageSpeed Insights v5 endpoint (same one the PHP used). */
export const PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** The two Lighthouse strategies we always run, in display order. */
export const DEVICE_STRATEGIES = ["mobile", "desktop"];

/**
 * Lighthouse categories to request. Google only runs the **Performance**
 * category unless categories are requested explicitly — without these the
 * Accessibility / Best Practices / SEO scores come back missing (blank) even
 * though the API call itself succeeds.
 */
export const PAGESPEED_BASE_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
];

/**
 * The Agentic Browsing category (Lighthouse 13.3+, returned by PageSpeed
 * Insights as a pass ratio rather than a 0–100 score). Requested alongside the
 * base categories so its `passed/total` counts are stored and shown too.
 */
export const PAGESPEED_AGENTIC_CATEGORY = "agentic-browsing";

/** Every category we ask PageSpeed Insights to run. */
export const PAGESPEED_CATEGORIES = [
  ...PAGESPEED_BASE_CATEGORIES,
  PAGESPEED_AGENTIC_CATEGORY,
];

/** Coarse status labels (identical strings to the PHP `*_status` fields). */
export const PAGESPEED_STATUS = {
  good: "good",
  needsImprovement: "needs-improvement",
  poor: "poor",
};

/**
 * Builds the runPagespeed request URL for one device.
 *
 * Mirrors the PHP: `?url=<urlencode>&strategy=<device>&key=<key>`, plus one
 * repeated `category` param per requested Lighthouse category.
 *
 * @param {{url: string, device: string, apiKey: string, categories?: string[]}} params
 * @returns {string}
 */
export function buildPageSpeedUrl({
  url,
  device,
  apiKey,
  categories = PAGESPEED_CATEGORIES,
}) {
  const params = new URLSearchParams();
  params.set("url", String(url ?? ""));
  params.set("strategy", String(device ?? ""));
  // One `category` param per category (Google only runs Performance otherwise).
  for (const category of categories) {
    params.append("category", category);
  }
  params.set("key", String(apiKey ?? ""));
  return `${PAGESPEED_ENDPOINT}?${params.toString()}`;
}

/**
 * Maps a 0..100 Lighthouse performance score to the PHP's `lighthouse_status`
 * label. Returns null when the score is missing (never invents a status).
 */
export function lighthouseStatusFromScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 90) return PAGESPEED_STATUS.good;
  if (score >= 50) return PAGESPEED_STATUS.needsImprovement;
  return PAGESPEED_STATUS.poor;
}

/**
 * Maps a CrUX `overall_category` (field data) to a status label.
 * FAST → good, AVERAGE → needs-improvement, SLOW → poor.
 */
export function cruxStatus(category) {
  if (typeof category !== "string") return null;
  switch (category.toUpperCase()) {
    case "FAST":
      return PAGESPEED_STATUS.good;
    case "AVERAGE":
      return PAGESPEED_STATUS.needsImprovement;
    case "SLOW":
      return PAGESPEED_STATUS.poor;
    default:
      return null;
  }
}

/**
 * Parses a raw Google PageSpeed response into the app's normalized report.
 *
 * Never throws: malformed JSON, a Google `error` payload, or a response
 * without `lighthouseResult` all become `{ ok: false, error }` with a message,
 * so the caller can surface it honestly instead of rendering fake numbers.
 *
 * @param {unknown} json decoded response body
 * @param {{device?: "mobile"|"desktop"}} [options]
 * @returns {{ok: true, report: object} | {ok: false, error: string}}
 */
export function parsePageSpeedResponse(json, { device = "mobile" } = {}) {
  if (!json || typeof json !== "object") {
    return { ok: false, error: "No valid PageSpeed response." };
  }

  if (json.error) {
    const message = json.error.message;
    return {
      ok: false,
      error:
        typeof message === "string" && message
          ? message
          : "PageSpeed Insights returned an error.",
    };
  }

  if (!json.lighthouseResult) {
    return { ok: false, error: "No valid PageSpeed response." };
  }

  const report = mapPageSpeedInsightsReport(json, { device });
  report.lighthouseStatus = lighthouseStatusFromScore(report.scores?.performance ?? null);
  report.coreWebVitalsStatus = cruxStatus(json.loadingExperience?.overall_category);
  return { ok: true, report };
}

/**
 * Picks the "Before" (baseline) and "Current" reports for one device from the
 * stored rows, using the `isBaseline` marker the install-time capture sets.
 *
 * - `baselineRow` is the earliest report explicitly marked `isBaseline`. It is
 *   preferred for "Before".
 * - `earliestRow` / `latestRow` are the earliest / latest reports overall. The
 *   earliest is the baseline fallback for rows that predate the marker (and for
 *   shops captured before the marker existed).
 * - `current` is the latest report, but `null` when that is the baseline itself,
 *   so a shop with only the install capture shows it under Before only.
 *
 * Pure: takes rows (`{ id, report }`) and returns the two report payloads.
 *
 * @param {{baselineRow?: object|null, earliestRow?: object|null, latestRow?: object|null}} rows
 * @returns {{baseline: object|null, current: object|null}}
 */
export function selectBaselineAndCurrent({
  baselineRow = null,
  earliestRow = null,
  latestRow = null,
} = {}) {
  const baseline = baselineRow ?? earliestRow ?? null;
  let current = latestRow ?? null;
  // Never show the baseline as "Current" — a shop with only the install capture
  // shows that score under Before only.
  if (baseline && current && current.id === baseline.id) current = null;
  return {
    baseline: baseline?.report ?? null,
    current: current?.report ?? null,
  };
}
