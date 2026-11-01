// Normalized report model + pure helpers for the Home dashboard.
//
// This module intentionally has zero React/Shopify/Prisma imports. It defines
// the internal shape every report has (see `fixtures.js` and `normalize.js`)
// and the pure functions for score colors, metric statuses and value
// formatting. Presentation components only call these helpers — they never
// hardcode thresholds or format numbers themselves.

/** Lighthouse-style score bands. */
export const SCORE_BANDS = [
  { key: "good", min: 90, max: 100, color: "#0b8043", label: "Good" },
  { key: "needs", min: 50, max: 89, color: "#e37400", label: "Needs improvement" },
  { key: "poor", min: 0, max: 49, color: "#d93025", label: "Poor" },
];

/** Returns the band for a 0–100 score, or `null` when the score is missing. */
export function scoreBand(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= SCORE_BANDS[0].min) return SCORE_BANDS[0];
  if (score >= SCORE_BANDS[1].min) return SCORE_BANDS[1];
  return SCORE_BANDS[2];
}

/** Color for a 0–100 score, or `null` when the score is missing. */
export function scoreColor(score) {
  return scoreBand(score)?.color ?? null;
}

/** Color for a metric status (good/needs/poor), or a neutral when null. */
export function metricColor(status) {
  return (
    { good: SCORE_BANDS[0].color, needs: SCORE_BANDS[1].color, poor: SCORE_BANDS[2].color }[
      status
    ] ?? "#dadce0"
  );
}

/** Human label for a metric status. */
export const METRIC_STATUS_LABELS = {
  good: "Good",
  needs: "Needs improvement",
  poor: "Poor",
};

/**
 * Ordered standard Lighthouse metrics. `goodMax`/`needsMax` are the standard
 * thresholds (values ≤ goodMax are good, ≤ needsMax need improvement,
 * anything larger is poor). Values are stored in the canonical unit listed.
 */
export const METRIC_DEFINITIONS = [
  {
    key: "firstContentfulPaint",
    label: "First Contentful Paint",
    shortLabel: "FCP",
    unit: "s",
    goodMax: 1.8,
    needsMax: 3.0,
    decimals: 1,
  },
  {
    key: "largestContentfulPaint",
    label: "Largest Contentful Paint",
    shortLabel: "LCP",
    unit: "s",
    goodMax: 2.5,
    needsMax: 4.0,
    decimals: 1,
  },
  {
    key: "totalBlockingTime",
    label: "Total Blocking Time",
    shortLabel: "TBT",
    unit: "ms",
    goodMax: 200,
    needsMax: 600,
    decimals: 0,
  },
  {
    key: "cumulativeLayoutShift",
    label: "Cumulative Layout Shift",
    shortLabel: "CLS",
    unit: "",
    goodMax: 0.1,
    needsMax: 0.25,
    decimals: 2,
  },
  {
    key: "speedIndex",
    label: "Speed Index",
    shortLabel: "SI",
    unit: "s",
    goodMax: 3.4,
    needsMax: 5.8,
    decimals: 1,
  },
];

/** Finds the definition for a metric key, or `null`. */
export function getMetricDefinition(key) {
  return METRIC_DEFINITIONS.find((def) => def.key === key) ?? null;
}

/**
 * Status for a metric value: "good" | "needs" | "poor" | null (missing).
 */
export function metricStatus(def, value) {
  if (!def || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= def.goodMax) return "good";
  if (value <= def.needsMax) return "needs";
  return "poor";
}

/**
 * Formats a metric value for display, e.g. `1.4 s`, `160 ms`, `0.08`.
 * Returns `null` when the value is missing.
 */
export function formatMetricValue(def, value) {
  if (!def || typeof value !== "number" || !Number.isFinite(value)) return null;
  const number = value.toFixed(def.decimals);
  return def.unit ? `${number} ${def.unit}` : number;
}

/** A normalized metric entry (mirrors the data model in the spec). */
export function metricEntry(value, unit = "") {
  return { value: typeof value === "number" ? value : null, unit };
}

/**
 * A fully "empty" report with every field null/empty — the safe starting
 * point when a device's report is missing entirely.
 */
export function emptyReport({ device = "mobile", source = "missing" } = {}) {
  return {
    device,
    capturedAt: null,
    source,
    scores: {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    },
    agenticBrowsing: { passed: 0, total: 0 },
    metrics: {
      firstContentfulPaint: metricEntry(null, "s"),
      largestContentfulPaint: metricEntry(null, "s"),
      totalBlockingTime: metricEntry(null, "ms"),
      cumulativeLayoutShift: metricEntry(null, ""),
      speedIndex: metricEntry(null, "s"),
    },
    screenshot: null,
    opportunities: [],
    diagnostics: [],
    passedAudits: [],
    // The audits behind the SEO & Site Health panel (`null` = not scanned).
    seoAudits: null,
  };
}

/** Formats a capture timestamp deterministically (UTC) for display. */
export function formatReportDate(iso) {
  if (typeof iso !== "string" || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Compact capture timestamp (UTC) for chart axis labels, e.g. `Sep 28`. */
export function formatShortDate(iso) {
  if (typeof iso !== "string" || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(date);
}