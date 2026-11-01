// Performance Overview helpers for the Home dashboard.
//
// Pure functions only — no React/Shopify/Prisma imports. They turn a pair of
// normalized reports (a "before" baseline and a "current" report for the same
// device) plus the stored report history into everything the
// `PerformanceOverview` component renders:
//
//   * the performance series for the chart, sliced by the 7/15/30-day filter,
//   * the summary metrics (Performance / LCP / TBT / CLS),
//   * the five Lighthouse score cards (incl. the Agentic Browsing ratio).
//
// Every value is derived from the reports themselves. A missing or invalid
// value becomes an explicit "missing" trend — an improvement is never claimed
// when it cannot be calculated, and a score is never invented. Thresholds and
// value formatting stay in `model.js`; this module only composes them.

import {
  METRIC_DEFINITIONS,
  formatMetricValue,
  getMetricDefinition,
} from "./model.js";

/** Trend states — the only values `trend` ever takes (mirrors `compare.js`). */
export const TREND = {
  improved: "improved",
  worsened: "worsened",
  same: "same",
  missing: "missing",
};

/** The four standard 0–100 Lighthouse categories shown as score cards. */
export const SCORE_CATEGORIES = [
  { key: "performance", label: "Performance" },
  { key: "accessibility", label: "Accessibility" },
  { key: "bestPractices", label: "Best Practices" },
  { key: "seo", label: "SEO" },
];

/** The metrics shown in the summary panel, in display order. */
export const SUMMARY_METRIC_KEYS = [
  "largestContentfulPaint",
  "totalBlockingTime",
  "cumulativeLayoutShift",
];

/** The chart windows offered by the Date range filter, in display order. */
export const REPORT_RANGES = [7, 15, 30];

/** The window the chart opens on. */
export const DEFAULT_RANGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Coerces a value to a finite number, or `null` for missing/invalid input. */
export function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Score difference (after − before) for a 0–100 score.
 * Higher is better, so a positive delta is `improved` and the arrow points up.
 */
export function scoreTrend(before, after) {
  const b = toNumber(before);
  const a = toNumber(after);
  const base = {
    before: b,
    after: a,
    delta: null,
    trend: TREND.missing,
    arrow: null,
    beforeText: b === null ? "—" : String(b),
    afterText: a === null ? "—" : String(a),
    deltaText: "—",
  };
  if (b === null || a === null) return base;

  const delta = a - b;
  const trend = delta > 0 ? TREND.improved : delta < 0 ? TREND.worsened : TREND.same;
  return {
    ...base,
    delta,
    trend,
    arrow: delta > 0 ? "up" : delta < 0 ? "down" : null,
    deltaText: `${delta > 0 ? "+" : ""}${delta}`,
  };
}

/**
 * Metric difference (after − before) for a metric where *lower is better*
 * (LCP, TBT, CLS, …). A negative delta is therefore `improved` and the arrow
 * points down. Values are formatted with the metric's own unit.
 */
export function metricTrend(definition, before, after) {
  const def = definition ?? null;
  const b = toNumber(before);
  const a = toNumber(after);
  const base = {
    key: def?.key ?? null,
    label: def?.label ?? "Metric",
    before: b,
    after: a,
    delta: null,
    trend: TREND.missing,
    arrow: null,
    beforeText: formatMetricValue(def, b) ?? "—",
    afterText: formatMetricValue(def, a) ?? "—",
    deltaText: "—",
  };
  if (!def || b === null || a === null) return base;

  const delta = a - b;
  const trend = delta < 0 ? TREND.improved : delta > 0 ? TREND.worsened : TREND.same;
  const deltaText = formatMetricValue(def, delta);
  return {
    ...base,
    delta,
    trend,
    arrow: delta < 0 ? "down" : delta > 0 ? "up" : null,
    deltaText: delta > 0 ? `+${deltaText}` : deltaText,
  };
}

/** The Agentic Browsing passed/total ratio, normalised (never negative). */
export function normalizeAgentic(value) {
  const passed = toNumber(value?.passed);
  const total = toNumber(value?.total);
  if (passed === null || total === null || total <= 0) {
    return { passed: 0, total: 0 };
  }
  return { passed: Math.max(0, Math.min(total, passed)), total };
}

/**
 * Agentic Browsing comparison. This category has no 0–100 score — PageSpeed
 * reports it as a passed/total check ratio — so it is compared as a ratio and
 * rendered as `2/3`, never as a Lighthouse score.
 */
export function agenticTrend(before, after) {
  const b = normalizeAgentic(before);
  const a = normalizeAgentic(after);

  const available = a.total > 0;
  const beforeText = b.total > 0 ? `${b.passed}/${b.total}` : "—";
  const afterText = a.total > 0 ? `${a.passed}/${a.total}` : "—";

  let trend = TREND.missing;
  let arrow = null;
  let deltaText = "—";
  if (b.total > 0 && a.total > 0) {
    const diff = a.passed - b.passed;
    trend = diff > 0 ? TREND.improved : diff < 0 ? TREND.worsened : TREND.same;
    arrow = diff > 0 ? "up" : diff < 0 ? "down" : null;
    deltaText = diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff}`;
  }

  return {
    available,
    before: b,
    after: a,
    trend,
    arrow,
    beforeText,
    afterText,
    deltaText,
  };
}

/** Summary panel data: the performance score plus the key metrics. */
export function buildPerformanceSummary(before, after) {
  return {
    performance: scoreTrend(before?.scores?.performance, after?.scores?.performance),
    metrics: SUMMARY_METRIC_KEYS.map((key) =>
      metricTrend(
        getMetricDefinition(key),
        before?.metrics?.[key]?.value,
        after?.metrics?.[key]?.value,
      ),
    ),
  };
}

/**
 * The five Lighthouse score cards: four 0–100 categories plus Agentic Browsing
 * (a pass ratio). Always returns five cards so the layout is stable; each card
 * carries its own trend/formatting, and a missing value is rendered as "—".
 */
export function buildScoreCards(before, after) {
  const cards = SCORE_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    kind: "score",
    ...scoreTrend(before?.scores?.[key], after?.scores?.[key]),
  }));
  cards.push({
    key: "agenticBrowsing",
    label: "Agentic Browsing",
    kind: "agentic",
    ...agenticTrend(before?.agenticBrowsing, after?.agenticBrowsing),
  });
  return cards;
}

/** UTC day key (`YYYY-MM-DD`) for a timestamp, or `null` when unparseable. */
function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Selects the observations the chart shows for a date window.
 *
 * Keeps only reports captured within the last `days` days and, when a day has
 * several runs, the most recent one — so the chart plots one point per day
 * instead of one per run. Returns ascending `{ at, report }` entries. The
 * install baseline is included when it falls inside the window.
 */
export function historyWithinDays(history, days, now = Date.now()) {
  const window = toNumber(days);
  if (!Array.isArray(history) || window === null || window <= 0) return [];

  const cutoff = now - window * DAY_MS;
  const byDay = new Map();
  for (const entry of history) {
    if (!entry) continue;
    const at = entry.capturedAt ?? entry.at ?? entry.report?.capturedAt ?? null;
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || date.getTime() < cutoff) continue;

    const key = dayKey(at);
    const existing = byDay.get(key);
    if (!existing || new Date(existing.at).getTime() <= date.getTime()) {
      byDay.set(key, { at: date.toISOString(), report: entry.report ?? entry });
    }
  }
  return [...byDay.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * Builds the chart series for the Performance Score.
 *
 * Real history wins: with two or more observations inside the selected window
 * the chart is a genuine daily time series, sliced by the Date range filter.
 * Otherwise it falls back to a valid two-point comparison labelled "Before
 * optimization" and "Current" — history is never fabricated from one report.
 * Each point carries the baseline (`before`) and the observed (`after`) score
 * so the component can plot both series and the tooltip.
 */
export function buildPerformanceSeries({ before, after, history, days, now } = {}) {
  const baselineScore = toNumber(before?.scores?.performance);
  const observations = historyWithinDays(history, days ?? DEFAULT_RANGE_DAYS, now);

  if (observations.length >= 2) {
    return observations.map((observation, index) => ({
      key: `observation-${index}`,
      // No per-point label: the chart labels each point with its capture date.
      label: null,
      at: observation.at,
      before: baselineScore,
      after: toNumber(observation.report?.scores?.performance),
    }));
  }

  const afterScore = toNumber(after?.scores?.performance);
  if (baselineScore === null && afterScore === null) return [];

  const start = baselineScore ?? afterScore;
  const end = afterScore ?? baselineScore;
  return [
    {
      key: "before-optimization",
      label: "Before optimization",
      at: before?.capturedAt ?? null,
      before: start,
      after: start,
    },
    {
      key: "current",
      label: "Current",
      at: after?.capturedAt ?? null,
      before: start,
      after: end,
    },
  ];
}

/** All five metric definitions, for callers that need to iterate them. */
export const OVERVIEW_METRICS = METRIC_DEFINITIONS;
