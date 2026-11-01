import test from "node:test";
import assert from "node:assert/strict";

import {
  DEVICE_STRATEGIES,
  PAGESPEED_AGENTIC_CATEGORY,
  PAGESPEED_BASE_CATEGORIES,
  PAGESPEED_CATEGORIES,
  PAGESPEED_ENDPOINT,
  buildPageSpeedUrl,
  cruxStatus,
  lighthouseStatusFromScore,
  parsePageSpeedResponse,
  selectBaselineAndCurrent,
} from "./pagespeed.js";

// A Google response shaped like the ones the original PHP endpoint consumed.
const FULL_RESPONSE = {
  loadingExperience: { overall_category: "AVERAGE" },
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
      },
      "largest-contentful-paint": {
        id: "largest-contentful-paint",
        title: "Largest Contentful Paint",
        numericValue: 2100,
      },
      "total-blocking-time": {
        id: "total-blocking-time",
        title: "Total Blocking Time",
        numericValue: 160,
      },
      "cumulative-layout-shift": {
        id: "cumulative-layout-shift",
        title: "Cumulative Layout Shift",
        numericValue: 0.08,
      },
      "speed-index": {
        id: "speed-index",
        title: "Speed Index",
        numericValue: 2800,
      },
      "render-blocking-resources": {
        id: "render-blocking-resources",
        title: "Eliminate render-blocking resources",
        score: 0,
        details: { type: "opportunity", overallSavingsMs: 600 },
      },
      "server-response-time": {
        id: "server-response-time",
        title: "Reduce initial server response time",
        score: 0,
        details: { type: "opportunity", overallSavingsMs: 1200 },
      },
      "main-thread-work": {
        id: "main-thread-work",
        title: "Minimize main-thread work",
        score: 0.3,
      },
      "passive-listeners": {
        id: "passive-listeners",
        title: "Use passive listeners to improve scrolling performance",
        score: 1,
      },
      "informative-only": {
        id: "informative-only",
        title: "Some informational audit",
        score: 0.5,
        scoreDisplayMode: "informative",
      },
    },
  },
};

test("buildPageSpeedUrl targets the v5 runPagespeed endpoint", () => {
  const url = buildPageSpeedUrl({
    url: "https://example.com/",
    device: "mobile",
    apiKey: "KEY123",
  });
  assert.ok(url.startsWith(`${PAGESPEED_ENDPOINT}?`));
  const params = new URL(url).searchParams;
  assert.equal(params.get("url"), "https://example.com/");
  assert.equal(params.get("strategy"), "mobile");
  assert.equal(params.get("key"), "KEY123");
});

test("buildPageSpeedUrl url-encodes the target URL and strategy", () => {
  const url = buildPageSpeedUrl({
    url: "https://example.com/path?x=1&y=2",
    device: "desktop",
    apiKey: "K",
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("url"), "https://example.com/path?x=1&y=2");
  assert.equal(params.get("strategy"), "desktop");
});

test("buildPageSpeedUrl requests every Lighthouse category", () => {
  const url = buildPageSpeedUrl({ url: "https://example.com/", device: "mobile", apiKey: "k" });
  const params = new URL(url).searchParams;
  // Performance-only would leave Accessibility / Best Practices / SEO blank.
  assert.deepEqual(params.getAll("category"), [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
    "agentic-browsing",
  ]);
  assert.deepEqual(PAGESPEED_CATEGORIES, [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
    "agentic-browsing",
  ]);
  assert.deepEqual(PAGESPEED_BASE_CATEGORIES, [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]);
  assert.equal(PAGESPEED_AGENTIC_CATEGORY, "agentic-browsing");
  // A caller can restrict the category list (used as the fallback request).
  const fallback = new URL(
    buildPageSpeedUrl({
      url: "https://example.com/",
      device: "mobile",
      apiKey: "k",
      categories: PAGESPEED_BASE_CATEGORIES,
    }),
  ).searchParams;
  assert.deepEqual(fallback.getAll("category"), PAGESPEED_BASE_CATEGORIES);
});

test("DEVICE_STRATEGIES runs both mobile and desktop", () => {
  assert.deepEqual(DEVICE_STRATEGIES, ["mobile", "desktop"]);
});

test("lighthouseStatusFromScore follows the PHP thresholds", () => {
  assert.equal(lighthouseStatusFromScore(90), "good");
  assert.equal(lighthouseStatusFromScore(100), "good");
  assert.equal(lighthouseStatusFromScore(89), "needs-improvement");
  assert.equal(lighthouseStatusFromScore(50), "needs-improvement");
  assert.equal(lighthouseStatusFromScore(49), "poor");
  assert.equal(lighthouseStatusFromScore(0), "poor");
  assert.equal(lighthouseStatusFromScore(null), null);
  assert.equal(lighthouseStatusFromScore("92"), null);
});

test("cruxStatus maps CrUX categories and ignores unknown values", () => {
  assert.equal(cruxStatus("FAST"), "good");
  assert.equal(cruxStatus("average"), "needs-improvement");
  assert.equal(cruxStatus("SLOW"), "poor");
  assert.equal(cruxStatus("NONE"), null);
  assert.equal(cruxStatus(undefined), null);
});

test("parsePageSpeedResponse maps a full response into the normalized report", () => {
  const result = parsePageSpeedResponse(FULL_RESPONSE, { device: "mobile" });
  assert.equal(result.ok, true);
  const report = result.report;

  assert.equal(report.device, "mobile");
  assert.equal(report.source, "pagespeed-insights");
  assert.equal(report.capturedAt, "2026-10-05T09:00:00.000Z");
  assert.deepEqual(report.scores, {
    performance: 92,
    accessibility: 100,
    bestPractices: 100,
    seo: 92,
  });

  // ms → s for FCP/LCP/Speed Index; ms kept for TBT; CLS raw.
  assert.deepEqual(report.metrics.firstContentfulPaint, { value: 1.4, unit: "s" });
  assert.deepEqual(report.metrics.largestContentfulPaint, { value: 2.1, unit: "s" });
  assert.deepEqual(report.metrics.totalBlockingTime, { value: 160, unit: "ms" });
  assert.deepEqual(report.metrics.cumulativeLayoutShift, { value: 0.08, unit: "" });
  assert.deepEqual(report.metrics.speedIndex, { value: 2.8, unit: "s" });

  // Opportunities include the savings label; failed diagnostics are kept;
  // informational audits are excluded; passes are separated.
  assert.equal(report.opportunities.length, 2);
  assert.deepEqual(
    report.opportunities.map((o) => o.savings).sort(),
    ["1.2 s", "600 ms"],
  );
  assert.equal(report.diagnostics.length, 1);
  assert.equal(report.diagnostics[0].id, "main-thread-work");
  assert.equal(report.passedAudits.length, 1);
  assert.equal(report.passedAudits[0].id, "passive-listeners");

  // Coarse status labels (PHP parity).
  assert.equal(report.lighthouseStatus, "good");
  assert.equal(report.coreWebVitalsStatus, "needs-improvement");

  // Raw JSON preserved for the caller (stripped before persisting).
  assert.equal(report.rawJson, FULL_RESPONSE);
});

test("parsePageSpeedResponse surfaces a Google error payload", () => {
  const result = parsePageSpeedResponse({
    error: { code: 400, message: "Invalid URL" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Invalid URL");
});

test("parsePageSpeedResponse rejects a response without lighthouseResult", () => {
  const result = parsePageSpeedResponse({ kind: "pagespeedonline#result" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "No valid PageSpeed response.");
});

test("parsePageSpeedResponse tolerates malformed/partial input without crashing", () => {
  for (const input of [null, undefined, "nope", 42, []]) {
    const result = parsePageSpeedResponse(input);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, "string");
  }

  // A valid-but-empty lighthouseResult still produces a complete report of nulls.
  const empty = parsePageSpeedResponse({ lighthouseResult: {} }, { device: "desktop" });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.report.scores, {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
  });
  assert.equal(empty.report.lighthouseStatus, null);
  assert.equal(empty.report.coreWebVitalsStatus, null);
});

test("selectBaselineAndCurrent prefers the marked baseline and the latest current", () => {
  const baselineRow = { id: "base", report: { scores: { performance: 60 } } };
  const earliestRow = { id: "base", report: { scores: { performance: 60 } } };
  const latestRow = { id: "after", report: { scores: { performance: 88 } } };
  const picked = selectBaselineAndCurrent({ baselineRow, earliestRow, latestRow });
  assert.equal(picked.baseline, baselineRow.report);
  assert.equal(picked.current, latestRow.report);
});

test("selectBaselineAndCurrent hides Current when the baseline is the only report", () => {
  const only = { id: "base", report: { scores: { performance: 60 } } };
  const picked = selectBaselineAndCurrent({
    baselineRow: only,
    earliestRow: only,
    latestRow: only,
  });
  assert.equal(picked.baseline, only.report);
  assert.equal(picked.current, null);
});

test("selectBaselineAndCurrent falls back to the earliest row for pre-marker reports", () => {
  // Reports written before `isBaseline` existed carry no marker: the earliest is
  // still the install capture, the latest is still Current.
  const earliest = { id: "install", report: { scores: { performance: 60 } } };
  const latest = { id: "after", report: { scores: { performance: 91 } } };
  const picked = selectBaselineAndCurrent({ earliestRow: earliest, latestRow: latest });
  assert.equal(picked.baseline, earliest.report);
  assert.equal(picked.current, latest.report);
});

test("selectBaselineAndCurrent returns nulls when nothing is stored", () => {
  assert.deepEqual(selectBaselineAndCurrent({}), { baseline: null, current: null });
  assert.deepEqual(selectBaselineAndCurrent(), { baseline: null, current: null });
});
