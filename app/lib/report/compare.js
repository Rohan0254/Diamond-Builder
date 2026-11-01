// Before/after comparison logic for the Home dashboard.
//
// Pure functions only. `compareReports(current, baseline)` produces one row
// per score/metric that the comparison table renders. Rules:
//   - Missing values on either side → a neutral "missing" row, no improvement
//     claim is ever made when a comparison cannot be calculated.
//   - Score rows compare difference in points (after − before).
//   - Time-like metric rows (FCP/LCP/TBT/Speed Index) compare elapsed time.
//   - CLS is compared as a plain numeric value, never as a time measurement.
//   - Nothing here asserts *causation* — an improved delta between two
//     reports is never labelled as "caused by Speed Scratcher".

import { METRIC_DEFINITIONS, formatMetricValue } from "./model.js";

/** Row states — the only values `state` ever takes. */
export const ROW_STATES = {
  improved: "improved",
  worsened: "worsened",
  same: "same",
  missing: "missing",
};

/** Formats an absolute change in the given metric's unit. */
function formatChange(def, change) {
  const abs = Math.abs(change);
  const number = abs.toFixed(def.decimals);
  return def.unit ? `${number} ${def.unit}` : number;
}

/**
 * Builds the row for the performance score.
 * `arrow`: "up" | "down" | null (direction the value moved on screen).
 */
function scoreRow(current, baseline) {
  const after = current?.scores?.performance ?? null;
  const before = baseline?.scores?.performance ?? null;
  const both = typeof before === "number" && typeof after === "number";

  const base = {
    key: "performance",
    label: "Performance",
    kind: "score",
    unit: "points",
    before,
    after,
    beforeText: both ? `${before}` : "—",
    afterText: both ? `${after}` : "—",
    delta: both ? after - before : null,
    state: ROW_STATES.missing,
    arrow: null,
    changeText: "Not available",
  };
  if (!both) return base;

  const delta = after - before;
  if (delta > 0) {
    return { ...base, state: ROW_STATES.improved, arrow: "up", changeText: `+${delta} points` };
  }
  if (delta < 0) {
    return { ...base, state: ROW_STATES.worsened, arrow: "down", changeText: `${delta} points` };
  }
  return { ...base, state: ROW_STATES.same, changeText: "no change" };
}

/**
 * Builds a row for one metric. For time-like metrics and CLS, a smaller
 * "after" value is an improvement (shown as a down arrow).
 */
function metricRow(def, current, baseline) {
  const after = current?.metrics?.[def.key]?.value ?? null;
  const before = baseline?.metrics?.[def.key]?.value ?? null;
  const both = typeof before === "number" && typeof after === "number";

  const base = {
    key: def.key,
    label: def.label,
    kind: "metric",
    unit: def.unit,
    before,
    after,
    beforeText: both ? formatMetricValue(def, before) : "—",
    afterText: both ? formatMetricValue(def, after) : "—",
    delta: both ? after - before : null,
    state: ROW_STATES.missing,
    arrow: null,
    changeText: "Not available",
  };
  if (!both) return base;

  const change = before - after; // positive → the value got smaller
  if (change > 0) {
    return {
      ...base,
      state: ROW_STATES.improved,
      arrow: "down",
      changeText: `Improved by ${formatChange(def, change)}`,
    };
  }
  if (change < 0) {
    return {
      ...base,
      state: ROW_STATES.worsened,
      arrow: "up",
      changeText: `Worsened by ${formatChange(def, change)}`,
    };
  }
  return { ...base, state: ROW_STATES.same, changeText: "no change" };
}

/**
 * Compares a current report with a baseline report for the same device.
 * Returns one row for the performance score plus the five standard metrics.
 * Returns an empty array when either report is missing.
 */
export function compareReports(current, baseline) {
  if (!current || !baseline) return [];
  return [
    scoreRow(current, baseline),
    ...METRIC_DEFINITIONS.map((def) => metricRow(def, current, baseline)),
  ];
}

/** The categories shown in the comparison (for tests/headers). */
export const COMPARISON_ROWS = [
  { key: "performance", label: "Performance", kind: "score" },
  ...METRIC_DEFINITIONS.map((def) => ({ key: def.key, label: def.label, kind: "metric" })),
];