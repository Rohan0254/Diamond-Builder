import test from "node:test";
import assert from "node:assert/strict";

import {
  SCORE_BANDS,
  METRIC_DEFINITIONS,
  scoreBand,
  scoreColor,
  metricStatus,
  metricColor,
  formatMetricValue,
  emptyReport,
  formatReportDate,
  formatShortDate,
  getMetricDefinition,
} from "./model.js";
import { getMockReports } from "./fixtures.js";
import {
  mapPageSpeedInsightsReport,
  agenticBrowsingFrom,
  savingsLabel,
  METRIC_AUDIT_KEYS,
} from "./normalize.js";
import { compareReports, COMPARISON_ROWS, ROW_STATES } from "./compare.js";
import {
  DEFAULT_RANGE_DAYS,
  REPORT_RANGES,
  TREND,
  SCORE_CATEGORIES,
  SUMMARY_METRIC_KEYS,
  toNumber,
  scoreTrend,
  metricTrend,
  agenticTrend,
  buildPerformanceSummary,
  buildScoreCards,
  buildPerformanceSeries,
  historyWithinDays,
} from "./overview.js";

const defFor = (key) => getMetricDefinition(key);

// ---------------------------------------------------------------- model

test("score bands follow Lighthouse thresholds", () => {
  assert.equal(scoreBand(100).key, "good");
  assert.equal(scoreBand(90).key, "good");
  assert.equal(scoreBand(89).key, "needs");
  assert.equal(scoreBand(50).key, "needs");
  assert.equal(scoreBand(49).key, "poor");
  assert.equal(scoreBand(0).key, "poor");
  assert.equal(scoreBand(null), null);
  assert.equal(scoreBand(undefined), null);
  assert.equal(scoreColor(92), SCORE_BANDS[0].color);
  assert.equal(scoreColor(65), SCORE_BANDS[1].color);
  assert.equal(scoreColor(20), SCORE_BANDS[2].color);
  assert.equal(scoreColor(null), null);
});

test("metric statuses follow the standard Lighthouse thresholds", () => {
  const fcp = defFor("firstContentfulPaint");
  assert.equal(metricStatus(fcp, 1.8), "good");
  assert.equal(metricStatus(fcp, 1.9), "needs");
  assert.equal(metricStatus(fcp, 3.0), "needs");
  assert.equal(metricStatus(fcp, 3.1), "poor");

  const lcp = defFor("largestContentfulPaint");
  assert.equal(metricStatus(lcp, 2.5), "good");
  assert.equal(metricStatus(lcp, 2.6), "needs");
  assert.equal(metricStatus(lcp, 4.0), "needs");
  assert.equal(metricStatus(lcp, 4.1), "poor");

  const tbt = defFor("totalBlockingTime");
  assert.equal(metricStatus(tbt, 200), "good");
  assert.equal(metricStatus(tbt, 201), "needs");
  assert.equal(metricStatus(tbt, 600), "needs");
  assert.equal(metricStatus(tbt, 601), "poor");

  const cls = defFor("cumulativeLayoutShift");
  assert.equal(metricStatus(cls, 0.1), "good");
  assert.equal(metricStatus(cls, 0.11), "needs");
  assert.equal(metricStatus(cls, 0.25), "needs");
  assert.equal(metricStatus(cls, 0.26), "poor");

  const si = defFor("speedIndex");
  assert.equal(metricStatus(si, 3.4), "good");
  assert.equal(metricStatus(si, 3.5), "needs");
  assert.equal(metricStatus(si, 5.8), "needs");
  assert.equal(metricStatus(si, 5.9), "poor");

  assert.equal(metricStatus(fcp, null), null);
  assert.equal(metricStatus(fcp, "1.4"), null);
  assert.ok(metricColor("good"));
  assert.ok(metricColor("needs"));
  assert.ok(metricColor("poor"));
});

test("metric values are formatted with their unit and never fabricated", () => {
  assert.equal(formatMetricValue(defFor("firstContentfulPaint"), 1.4), "1.4 s");
  assert.equal(formatMetricValue(defFor("totalBlockingTime"), 160), "160 ms");
  assert.equal(formatMetricValue(defFor("cumulativeLayoutShift"), 0.08), "0.08");
  assert.equal(formatMetricValue(defFor("largestContentfulPaint"), 2.1), "2.1 s");
  assert.equal(formatMetricValue(defFor("speedIndex"), 2.8), "2.8 s");
  assert.equal(formatMetricValue(defFor("speedIndex"), null), null);
  assert.equal(formatMetricValue(defFor("speedIndex"), "nope"), null);
});

test("emptyReport is a safe, complete normalized report", () => {
  const report = emptyReport({ device: "desktop" });
  assert.equal(report.device, "desktop");
  assert.equal(report.capturedAt, null);
  assert.equal(report.screenshot, null);
  for (const key of ["performance", "accessibility", "bestPractices", "seo"]) {
    assert.equal(report.scores[key], null);
  }
  for (const def of METRIC_DEFINITIONS) {
    assert.deepEqual(report.metrics[def.key], { value: null, unit: def.unit });
  }
  assert.deepEqual(report.opportunities, []);
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.passedAudits, []);
});

test("formatReportDate formats valid dates and rejects garbage", () => {
  assert.equal(formatReportDate("2026-09-28T10:00:00.000Z"), "September 28, 2026");
  assert.equal(formatReportDate(null), null);
  assert.equal(formatReportDate("not-a-date"), null);
  assert.equal(formatReportDate(12345), null);
});

// -------------------------------------------------------------- fixtures

test("fixtures expose four isolated reports with the spec's sample values", () => {
  const { current, baseline } = getMockReports();

  // Spec's initial Mobile values.
  assert.equal(current.mobile.scores.performance, 92);
  assert.equal(current.mobile.scores.accessibility, 100);
  assert.equal(current.mobile.scores.bestPractices, 100);
  assert.equal(current.mobile.scores.seo, 92);
  assert.deepEqual(current.mobile.agenticBrowsing, { passed: 2, total: 3 });

  // Devices are independent data sets.
  assert.notEqual(current.mobile.scores.performance, current.desktop.scores.performance);
  assert.notEqual(current.mobile.metrics.largestContentfulPaint.value, current.desktop.metrics.largestContentfulPaint.value);

  // Current and baseline are distinct objects, never derived from each other.
  assert.notEqual(current.mobile.scores.performance, baseline.mobile.scores.performance);
  assert.notEqual(current.mobile.scores.accessibility, baseline.mobile.scores.accessibility);

  // Timestamps: current not captured yet, baseline has a fixed capture date.
  assert.equal(current.mobile.capturedAt, null);
  assert.equal(current.desktop.capturedAt, null);
  assert.equal(baseline.mobile.capturedAt, "2026-09-28T10:00:00.000Z");
  assert.equal(baseline.desktop.capturedAt, "2026-09-28T10:00:00.000Z");
});

test("every fixture report is a complete, well-formed normalized report", () => {
  const { current, baseline } = getMockReports();
  for (const report of [
    current.mobile,
    current.desktop,
    baseline.mobile,
    baseline.desktop,
  ]) {
    assert.match(report.device, /^(mobile|desktop)$/);
    assert.equal(report.source, "mock");
    assert.equal(report.screenshot, null);
    for (const def of METRIC_DEFINITIONS) {
      const entry = report.metrics[def.key];
      assert.ok(entry, `missing metric ${def.key}`);
      assert.equal(typeof entry.value, "number", `${report.device} ${def.key} value`);
      assert.equal(entry.unit, def.unit);
    }
    for (const key of ["opportunities", "diagnostics", "passedAudits"]) {
      assert.ok(Array.isArray(report[key]), `${report.device} ${key}`);
    }
  }
});

// ------------------------------------------------------------- normalize

const SAMPLE_PSI = {
  lighthouseResult: {
    fetchTime: "2026-10-05T09:00:00.000Z",
    categories: {
      performance: { score: 0.92 },
      accessibility: { score: 1 },
      "best-practices": { score: 1 },
      seo: { score: 0.92 },
    },
    audits: {
      "first-contentful-paint": {
        id: "first-contentful-paint",
        title: "First Contentful Paint",
        numericValue: 1400,
        displayValue: "1.4 s",
      },
      "largest-contentful-paint": {
        id: "largest-contentful-paint",
        title: "Largest Contentful Paint",
        numericValue: 2100,
        displayValue: "2.1 s",
      },
      "total-blocking-time": {
        id: "total-blocking-time",
        title: "Total Blocking Time",
        numericValue: 160,
        displayValue: "160 ms",
      },
      "cumulative-layout-shift": {
        id: "cumulative-layout-shift",
        title: "Cumulative Layout Shift",
        numericValue: 0.08,
        displayValue: "0.08",
      },
      "speed-index": {
        id: "speed-index",
        title: "Speed Index",
        numericValue: 2800,
        displayValue: "2.8 s",
      },
      "render-blocking": {
        id: "render-blocking",
        title: "Eliminate render-blocking resources",
        score: 0,
        scoreDisplayMode: "binary",
        details: { type: "opportunity", overallSavingsMs: 600 },
      },
      "main-thread": {
        id: "main-thread",
        title: "Minimize main-thread work",
        score: 0.55,
        details: { type: "diagnostic" },
      },
      "passive-listeners": {
        id: "passive-listeners",
        title: "Use passive listeners to improve scrolling performance",
        score: 1,
      },
    },
  },
};

test("mapPageSpeedInsightsReport maps a full PSI JSON into the normalized model", () => {
  const report = mapPageSpeedInsightsReport(SAMPLE_PSI, { device: "mobile" });

  assert.equal(report.device, "mobile");
  assert.equal(report.source, "pagespeed-insights");
  assert.equal(report.capturedAt, "2026-10-05T09:00:00.000Z");
  assert.deepEqual(report.scores, {
    performance: 92,
    accessibility: 100,
    bestPractices: 100,
    seo: 92,
  });

  // ms → s conversions on FCP/LCP/SI, raw ms for TBT, raw value for CLS.
  assert.deepEqual(report.metrics.firstContentfulPaint, { value: 1.4, unit: "s" });
  assert.deepEqual(report.metrics.largestContentfulPaint, { value: 2.1, unit: "s" });
  assert.deepEqual(report.metrics.totalBlockingTime, { value: 160, unit: "ms" });
  assert.deepEqual(report.metrics.cumulativeLayoutShift, { value: 0.08, unit: "" });
  assert.deepEqual(report.metrics.speedIndex, { value: 2.8, unit: "s" });

  // Audits mapped into groups.
  assert.equal(report.opportunities.length, 1);
  assert.equal(report.opportunities[0].title, "Eliminate render-blocking resources");
  assert.equal(report.opportunities[0].savings, "600 ms");
  assert.equal(report.diagnostics.length, 1);
  assert.equal(report.diagnostics[0].score, 0.55);
  assert.equal(report.passedAudits.length, 1);
  assert.equal(report.passedAudits[0].title, "Use passive listeners to improve scrolling performance");

  // No `agentic-browsing` category in this sample, so it stays neutral.
  assert.deepEqual(report.agenticBrowsing, { passed: 0, total: 0 });
  assert.equal(report.screenshot, null);

  // Raw JSON preserved for debugging/future audit mapping.
  assert.equal(report.rawJson, SAMPLE_PSI);
});

test("mapPageSpeedInsightsReport derives the Agentic Browsing pass ratio", () => {
  const psi = {
    lighthouseResult: {
      fetchTime: "2026-06-20T00:00:00.000Z",
      categories: {
        "agentic-browsing": {
          id: "agentic-browsing",
          title: "Agentic Browsing",
          categoryScoreDisplayMode: "FRACTION",
          score: 2 / 3,
          auditRefs: [
            { id: "llms-txt", weight: 1 },
            { id: "agentic-accessibility-tree", weight: 1 },
            { id: "layout-stability", weight: 1 },
            { id: "webmcp-tools", weight: 1 },
          ],
        },
      },
      audits: {
        "llms-txt": { id: "llms-txt", score: 1, scoreDisplayMode: "binary" },
        "agentic-accessibility-tree": { id: "agentic-accessibility-tree", score: 0, scoreDisplayMode: "binary" },
        "layout-stability": { id: "layout-stability", score: 1, scoreDisplayMode: "binary" },
        // Not applicable audits are dropped from the count (not scored 0).
        "webmcp-tools": { id: "webmcp-tools", score: null, scoreDisplayMode: "notApplicable" },
      },
    },
  };

  const report = mapPageSpeedInsightsReport(psi, { device: "mobile" });
  assert.deepEqual(report.agenticBrowsing, { passed: 2, total: 3 });
});

test("agenticBrowsingFrom ignores informative/manual audits and missing data", () => {
  assert.deepEqual(agenticBrowsingFrom(undefined, undefined), { passed: 0, total: 0 });
  assert.deepEqual(agenticBrowsingFrom({}, {}), { passed: 0, total: 0 });

  const categories = {
    "agentic-browsing": {
      auditRefs: [
        { id: "informative-audit" },
        { id: "manual-audit" },
        { id: "missing-audit" },
      ],
    },
  };
  const audits = {
    "informative-audit": { id: "informative-audit", score: 1, scoreDisplayMode: "informative" },
    "manual-audit": { id: "manual-audit", score: 1, scoreDisplayMode: "manual" },
  };
  assert.deepEqual(agenticBrowsingFrom(categories, audits), { passed: 0, total: 0 });
});

test("mapPageSpeedInsightsReport tolerates missing/partial JSON", () => {
  const empty = mapPageSpeedInsightsReport({}, { device: "desktop" });
  assert.equal(empty.device, "desktop");
  assert.deepEqual(empty.scores, {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
  });
  for (const def of METRIC_DEFINITIONS) {
    assert.equal(empty.metrics[def.key].value, null);
  }
  assert.deepEqual(empty.opportunities, []);
  assert.deepEqual(empty.diagnostics, []);
  assert.deepEqual(empty.passedAudits, []);

  const nothing = mapPageSpeedInsightsReport(null);
  assert.equal(nothing.scores.performance, null);

  // Nested envelope vs bare lighthouseResult both work.
  const bare = mapPageSpeedInsightsReport({ fetchTime: "2026-01-01T00:00:00.000Z" });
  assert.equal(bare.capturedAt, "2026-01-01T00:00:00.000Z");
});

test("savingsLabel renders compact savings amounts", () => {
  assert.equal(savingsLabel(600), "600 ms");
  assert.equal(savingsLabel(1500), "1.5 s");
  assert.equal(savingsLabel(undefined), null);
  assert.equal(savingsLabel("600"), null);
});

test("metric audit key mapping covers all five standard metrics", () => {
  assert.deepEqual(METRIC_AUDIT_KEYS, {
    firstContentfulPaint: "first-contentful-paint",
    largestContentfulPaint: "largest-contentful-paint",
    totalBlockingTime: "total-blocking-time",
    cumulativeLayoutShift: "cumulative-layout-shift",
    speedIndex: "speed-index",
  });
});

// --------------------------------------------------------------- compare

test("comparison shows +20 points and improved times for the sample fixtures", () => {
  const { current, baseline } = getMockReports();
  const rows = compareReports(current.mobile, baseline.mobile);
  assert.equal(rows.length, 6);

  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  const perf = byKey.performance;
  assert.equal(perf.state, ROW_STATES.improved);
  assert.equal(perf.beforeText, "72");
  assert.equal(perf.afterText, "92");
  assert.equal(perf.changeText, "+20 points");
  assert.equal(perf.arrow, "up");

  const lcp = byKey.largestContentfulPaint;
  assert.equal(lcp.state, ROW_STATES.improved);
  assert.equal(lcp.beforeText, "4.2 s");
  assert.equal(lcp.afterText, "2.1 s");
  assert.equal(lcp.changeText, "Improved by 2.1 s");
  assert.equal(lcp.arrow, "down");

  assert.equal(byKey.totalBlockingTime.changeText, "Improved by 320 ms");
  assert.equal(byKey.firstContentfulPaint.changeText, "Improved by 0.7 s");
  assert.equal(byKey.speedIndex.changeText, "Improved by 1.1 s");

  // CLS compared as a plain number, not a time.
  const cls = byKey.cumulativeLayoutShift;
  assert.equal(cls.changeText, "Improved by 0.10");
  assert.equal(cls.unit, "");
});

test("comparison reports worsening correctly", () => {
  const { current, baseline } = getMockReports();
  const rows = compareReports(baseline.mobile, current.mobile);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  assert.equal(byKey.performance.state, ROW_STATES.worsened);
  assert.equal(byKey.performance.changeText, "-20 points");
  assert.equal(byKey.performance.arrow, "down");
  assert.equal(byKey.largestContentfulPaint.state, ROW_STATES.worsened);
  assert.equal(byKey.largestContentfulPaint.changeText, "Worsened by 2.1 s");
  assert.equal(byKey.largestContentfulPaint.arrow, "up");
});

test("comparison is neutral when a report or metric is missing", () => {
  const { current } = getMockReports();

  // Missing baseline entirely → no rows, no claims.
  assert.deepEqual(compareReports(current.mobile, null), []);
  assert.deepEqual(compareReports(null, current.mobile), []);

  // Missing individual scores/metrics → neutral "missing" rows.
  const incomplete = {
    device: "mobile",
    scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
    metrics: {
      firstContentfulPaint: { value: null, unit: "s" },
      largestContentfulPaint: { value: null, unit: "s" },
      totalBlockingTime: { value: null, unit: "ms" },
      cumulativeLayoutShift: { value: null, unit: "" },
      speedIndex: { value: null, unit: "s" },
    },
  };
  const rows = compareReports(incomplete, current.mobile);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey.performance.state, ROW_STATES.missing);
  assert.equal(byKey.performance.changeText, "Not available");
  assert.equal(byKey.performance.beforeText, "—");
  assert.equal(byKey.largestContentfulPaint.state, ROW_STATES.missing);
});

test("unchanged values show a neutral 'no change' row", () => {
  const { current } = getMockReports();
  const rows = compareReports(current.mobile, current.mobile);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey.performance.state, ROW_STATES.same);
  assert.equal(byKey.performance.changeText, "no change");
  assert.equal(byKey.totalBlockingTime.state, ROW_STATES.same);
  assert.equal(byKey.totalBlockingTime.changeText, "no change");
});

test("comparison rows cover performance plus the five standard metrics", () => {
  assert.deepEqual(
    COMPARISON_ROWS.map((row) => row.key),
    [
      "performance",
      "firstContentfulPaint",
      "largestContentfulPaint",
      "totalBlockingTime",
      "cumulativeLayoutShift",
      "speedIndex",
    ],
  );
});

// --------------------------------------------------------------- overview

test("toNumber accepts finite numbers and rejects everything else", () => {
  assert.equal(toNumber(92), 92);
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber(-1.5), -1.5);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(undefined), null);
  assert.equal(toNumber("92"), null);
  assert.equal(toNumber(NaN), null);
  assert.equal(toNumber(Infinity), null);
});

test("scoreTrend reports improvement, regression, sameness and missing data", () => {
  const up = scoreTrend(72, 92);
  assert.equal(up.trend, TREND.improved);
  assert.equal(up.arrow, "up");
  assert.equal(up.delta, 20);
  assert.equal(up.deltaText, "+20");
  assert.equal(up.beforeText, "72");
  assert.equal(up.afterText, "92");

  const down = scoreTrend(92, 72);
  assert.equal(down.trend, TREND.worsened);
  assert.equal(down.arrow, "down");
  assert.equal(down.deltaText, "-20");

  const same = scoreTrend(80, 80);
  assert.equal(same.trend, TREND.same);
  assert.equal(same.arrow, null);
  assert.equal(down.state, undefined); // this module speaks `trend`, not `state`

  const missing = scoreTrend(null, 92);
  assert.equal(missing.trend, TREND.missing);
  assert.equal(missing.delta, null);
  assert.equal(missing.beforeText, "—");
  assert.equal(scoreTrend(undefined, undefined).trend, TREND.missing);
});

test("metricTrend treats a lower value as an improvement and formats units", () => {
  const lcp = getMetricDefinition("largestContentfulPaint");
  const better = metricTrend(lcp, 4.2, 2.1);
  assert.equal(better.trend, TREND.improved);
  assert.equal(better.arrow, "down");
  assert.equal(better.beforeText, "4.2 s");
  assert.equal(better.afterText, "2.1 s");
  assert.equal(better.deltaText, "-2.1 s");

  const worse = metricTrend(lcp, 2.1, 4.2);
  assert.equal(worse.trend, TREND.worsened);
  assert.equal(worse.arrow, "up");
  assert.equal(worse.deltaText, "+2.1 s");

  const cls = metricTrend(defFor("cumulativeLayoutShift"), 0.18, 0.08);
  assert.equal(cls.deltaText, "-0.10");

  const tbt = metricTrend(defFor("totalBlockingTime"), 480, 160);
  assert.equal(tbt.deltaText, "-320 ms");

  const missing = metricTrend(lcp, 2.1, null);
  assert.equal(missing.trend, TREND.missing);
  assert.equal(missing.afterText, "—");
  assert.equal(missing.deltaText, "—");
});

test("agenticTrend compares pass ratios, never treating them as a score", () => {
  const improved = agenticTrend({ passed: 1, total: 3 }, { passed: 2, total: 3 });
  assert.equal(improved.trend, TREND.improved);
  assert.equal(improved.deltaText, "+1");
  assert.equal(improved.beforeText, "1/3");
  assert.equal(improved.afterText, "2/3");
  assert.equal(improved.available, true);

  const same = agenticTrend({ passed: 2, total: 3 }, { passed: 2, total: 3 });
  assert.equal(same.trend, TREND.same);
  assert.equal(same.deltaText, "no change");

  const missing = agenticTrend({ passed: 0, total: 0 }, { passed: 0, total: 0 });
  assert.equal(missing.trend, TREND.missing);
  assert.equal(missing.available, false);
  assert.equal(missing.afterText, "—");
});

test("buildPerformanceSummary reads the fixtures' performance score and metrics", () => {
  const { current, baseline } = getMockReports();
  const summary = buildPerformanceSummary(baseline.mobile, current.mobile);

  assert.equal(summary.performance.trend, TREND.improved);
  assert.equal(summary.performance.beforeText, "72");
  assert.equal(summary.performance.afterText, "92");
  assert.equal(summary.performance.deltaText, "+20");

  const keys = summary.metrics.map((metric) => metric.key);
  assert.deepEqual(keys, SUMMARY_METRIC_KEYS);

  const [lcp, tbt, cls] = summary.metrics;
  assert.equal(lcp.label, "Largest Contentful Paint");
  assert.equal(lcp.beforeText, "4.2 s");
  assert.equal(lcp.afterText, "2.1 s");
  assert.equal(lcp.trend, TREND.improved);
  assert.equal(tbt.deltaText, "-320 ms");
  assert.equal(cls.deltaText, "-0.10");
});

test("buildScoreCards always returns the five expected cards", () => {
  const { current, baseline } = getMockReports();
  const cards = buildScoreCards(baseline.mobile, current.mobile);

  assert.equal(cards.length, 5);
  assert.deepEqual(
    cards.map((card) => card.key),
    [...SCORE_CATEGORIES.map((category) => category.key), "agenticBrowsing"],
  );

  const performance = cards[0];
  assert.equal(performance.kind, "score");
  assert.equal(performance.afterText, "92");
  assert.equal(performance.trend, TREND.improved);

  const agentic = cards[4];
  assert.equal(agentic.kind, "agentic");
  assert.equal(agentic.afterText, "2/3");
  assert.equal(agentic.available, true);
});

test("buildScoreCards degrades gracefully with missing reports", () => {
  const cards = buildScoreCards(null, null);
  assert.equal(cards.length, 5);
  for (const card of cards.slice(0, 4)) {
    assert.equal(card.trend, TREND.missing);
    assert.equal(card.afterText, "—");
  }
  assert.equal(cards[4].available, false);
});

test("buildPerformanceSeries falls back to a two-point comparison", () => {
  const { current, baseline } = getMockReports();
  const series = buildPerformanceSeries({ before: baseline.mobile, after: current.mobile });

  assert.equal(series.length, 2);
  assert.deepEqual(
    series.map((point) => point.label),
    ["Before optimization", "Current"],
  );
  assert.equal(series[0].before, 72);
  assert.equal(series[0].after, 72);
  assert.equal(series[1].before, 72);
  assert.equal(series[1].after, 92);
  assert.equal(series[1].at, null);

  // No reports at all → nothing to plot, never a fabricated point.
  assert.deepEqual(buildPerformanceSeries({ before: null, after: null }), []);
});

test("buildPerformanceSeries builds a daily time series from stored history", () => {
  const { baseline } = getMockReports();
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const history = [
    { capturedAt: "2026-10-01T00:00:00.000Z", scores: { performance: 80 } },
    { capturedAt: "2026-10-08T00:00:00.000Z", scores: { performance: 88 } },
    { capturedAt: "2026-10-15T00:00:00.000Z", scores: { performance: 95 } },
  ];
  const series = buildPerformanceSeries({ before: baseline.mobile, after: null, history, days: 30, now });

  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((point) => point.after),
    [80, 88, 95],
  );
  // The baseline is the flat "Before" line; each point carries the observed
  // "After" score and its own date (the axis labels it, so label stays null).
  assert.deepEqual(
    series.map((point) => point.before),
    [72, 72, 72],
  );
  assert.deepEqual(
    series.map((point) => point.label),
    [null, null, null],
  );
  assert.equal(series[2].at, "2026-10-15T00:00:00.000Z");
});

test("historyWithinDays keeps the latest report per day and drops older days", () => {
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const history = [
    { capturedAt: "2026-09-20T00:00:00.000Z", scores: { performance: 60 } },
    { capturedAt: "2026-10-14T09:00:00.000Z", scores: { performance: 70 } },
    { capturedAt: "2026-10-14T20:00:00.000Z", scores: { performance: 75 } },
    { capturedAt: "2026-10-15T09:00:00.000Z", scores: { performance: 90 } },
  ];
  const week = historyWithinDays(history, 7, now);

  assert.deepEqual(
    week.map((entry) => entry.at),
    ["2026-10-14T20:00:00.000Z", "2026-10-15T09:00:00.000Z"],
  );
  // The latest run of the 14th wins (75, not 70).
  assert.equal(week[0].report.scores.performance, 75);

  // A wider window keeps the older day; an invalid window is empty.
  assert.equal(historyWithinDays(history, 30, now).length, 3);
  assert.deepEqual(historyWithinDays(history, 0, now), []);
  assert.deepEqual(historyWithinDays(null, 7, now), []);
});

test("buildPerformanceSeries windows history with the range filter", () => {
  const { baseline } = getMockReports();
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const history = [
    { capturedAt: "2026-09-20T00:00:00.000Z", scores: { performance: 60 } },
    { capturedAt: "2026-10-14T00:00:00.000Z", scores: { performance: 80 } },
    { capturedAt: "2026-10-15T00:00:00.000Z", scores: { performance: 90 } },
  ];

  // 7 days drops the September observation; 30 days keeps all three.
  assert.equal(
    buildPerformanceSeries({ before: baseline.mobile, after: null, history, days: 7, now }).length,
    2,
  );
  assert.equal(
    buildPerformanceSeries({ before: baseline.mobile, after: null, history, days: 30, now }).length,
    3,
  );
});

test("range filter offers the 7/15/30-day windows and defaults to 7", () => {
  assert.deepEqual(REPORT_RANGES, [7, 15, 30]);
  assert.equal(DEFAULT_RANGE_DAYS, 7);
});

test("formatShortDate formats a compact UTC day and rejects garbage", () => {
  assert.equal(formatShortDate("2026-09-28T10:00:00.000Z"), "Sep 28");
  assert.equal(formatShortDate(null), null);
  assert.equal(formatShortDate("not-a-date"), null);
});