// Mock report fixtures for the Home dashboard.
//
// This is the ONLY place sample report data lives. The values below are
// placeholder UI numbers — they are NOT measured results and must not be
// presented as real. When a real Google PageSpeed Insights JSON report is
// available, `mapPageSpeedInsightsReport` in `./normalize.js` turns it into
// the same normalized shape, so the UI does not need to change.
//
// The fixtures are organised as four isolated report objects:
//   current  (mobile + desktop) — the report "with Speed Scratcher"
//   baseline (mobile + desktop) — the report "before Speed Scratcher"
//
// They are intentionally DIFFERENT data sets (never derived by subtracting
// points from each other).

/** @param {Partial<import("./model.js").emptyReport>} fields */
function report(fields) {
  return {
    capturedAt: null,
    source: "mock",
    scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
    agenticBrowsing: { passed: 0, total: 0 },
    metrics: {
      firstContentfulPaint: { value: null, unit: "s" },
      largestContentfulPaint: { value: null, unit: "s" },
      totalBlockingTime: { value: null, unit: "ms" },
      cumulativeLayoutShift: { value: null, unit: "" },
      speedIndex: { value: null, unit: "s" },
    },
    screenshot: null,
    opportunities: [],
    diagnostics: [],
    passedAudits: [],
    seoAudits: null,
    ...fields,
  };
}

/**
 * One stored SEO audit (`{ score, scoreDisplayMode, itemCount, items }`) in the
 * same shape `seoAuditsFrom` writes, so the SEO & Site Health panel renders the
 * sample exactly as it renders a real scan.
 */
function audit(score, items = []) {
  return {
    score,
    scoreDisplayMode: "binary",
    itemCount: items.length,
    items,
  };
}

/** Sample `seoAudits` bundle for one mock report. */
function seoAudits(audits) {
  return { scannedAt: "2026-10-14T09:12:00.000Z", audits };
}


/** Sample data — current report on mobile (mirrors the spec's example values). */
const currentMobile = report({
  device: "mobile",
  source: "mock",
  scores: { performance: 92, accessibility: 100, bestPractices: 100, seo: 92 },
  agenticBrowsing: { passed: 2, total: 3 },
  metrics: {
    firstContentfulPaint: { value: 1.4, unit: "s" },
    largestContentfulPaint: { value: 2.1, unit: "s" },
    totalBlockingTime: { value: 160, unit: "ms" },
    cumulativeLayoutShift: { value: 0.08, unit: "" },
    speedIndex: { value: 2.8, unit: "s" },
  },
  opportunities: [
    {
      id: "render-blocking",
      title: "Eliminate render-blocking resources",
      savings: "0.6 s",
      description:
        "Several JavaScript and CSS files delay the first render. Sample finding for the UI preview.",
    },
    {
      id: "image-size",
      title: "Properly size images",
      savings: "0.4 s",
      description:
        "Some images are larger than their display size. Sample finding for the UI preview.",
    },
    {
      id: "next-gen-formats",
      title: "Serve images in next-gen formats",
      savings: "0.3 s",
      description:
        "Convert images to modern formats to reduce transfer size. Sample finding for the UI preview.",
    },
  ],
  diagnostics: [
    {
      id: "main-thread",
      title: "Minimize main-thread work",
      score: 0.55,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "js-execution",
      title: "Reduce JavaScript execution time",
      score: 0.82,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "layout-shifts",
      title: "Avoid large layout shifts",
      score: 0.93,
      description: "Sample diagnostic value for the UI preview.",
    },
  ],
  passedAudits: [
    { id: "passive-listeners", title: "Use passive listeners to improve scrolling performance" },
    { id: "cache-policy", title: "Serve static assets with an efficient cache policy" },
    { id: "dom-size", title: "Avoid an excessive DOM size" },
  ],
  // Sample SEO & Site Health audits (see `report/seo.js`) — illustrative values
  // for the UI preview, shown only under the "Showing sample data" banner.
  seoAudits: seoAudits({
    "image-alt": audit(0, [
      { url: null, label: "img.hero-banner__img" },
      { url: null, label: "img.product-card__thumb" },
    ]),
    redirects: audit(1),
    "document-title": audit(1),
    "meta-description": audit(0),
    "crawlable-anchors": audit(1),
    "link-text": audit(0, [
      {
        url: "https://speed-scatcher.myshopify.com/collections/all",
        label: '<a href="/collections/all">Shop</a>',
      },
      {
        url: "https://speed-scatcher.myshopify.com/pages/about",
        label: '<a href="/pages/about">Read more</a>',
      },
      {
        url: "https://speed-scatcher.myshopify.com/blogs/news",
        label: '<a href="/blogs/news">Click here</a>',
      },
    ]),
    canonical: audit(1),
  }),
});

/** Sample data — current report on desktop. */
const currentDesktop = report({
  device: "desktop",
  source: "mock",
  scores: { performance: 96, accessibility: 100, bestPractices: 100, seo: 95 },
  agenticBrowsing: { passed: 3, total: 3 },
  metrics: {
    firstContentfulPaint: { value: 1.2, unit: "s" },
    largestContentfulPaint: { value: 1.8, unit: "s" },
    totalBlockingTime: { value: 95, unit: "ms" },
    cumulativeLayoutShift: { value: 0.05, unit: "" },
    speedIndex: { value: 2.3, unit: "s" },
  },
  opportunities: [
    {
      id: "render-blocking",
      title: "Eliminate render-blocking resources",
      savings: "0.3 s",
      description: "Sample desktop finding for the UI preview.",
    },
    {
      id: "server-response",
      title: "Reduce initial server response time",
      savings: "0.2 s",
      description: "Sample desktop finding for the UI preview.",
    },
  ],
  diagnostics: [
    {
      id: "js-execution",
      title: "Reduce JavaScript execution time",
      score: 0.88,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "network-requests",
      title: "Avoid chaining critical requests",
      score: 0.74,
      description: "Sample diagnostic value for the UI preview.",
    },
  ],
  passedAudits: [
    { id: "passive-listeners", title: "Use passive listeners to improve scrolling performance" },
    { id: "dom-size", title: "Avoid an excessive DOM size" },
  ],
  // A fully healthy scan, so the panel's green state is visible in the preview.
  seoAudits: seoAudits({
    "image-alt": audit(1),
    redirects: audit(1),
    "document-title": audit(1),
    "meta-description": audit(1),
    "crawlable-anchors": audit(1),
    "link-text": audit(1),
    canonical: audit(1),
  }),
});

/** Sample data — baseline report before Speed Scratcher, mobile. */
const baselineMobile = report({
  device: "mobile",
  source: "mock",
  capturedAt: "2026-09-28T10:00:00.000Z",
  scores: { performance: 72, accessibility: 88, bestPractices: 81, seo: 85 },
  agenticBrowsing: { passed: 1, total: 3 },
  metrics: {
    firstContentfulPaint: { value: 2.1, unit: "s" },
    largestContentfulPaint: { value: 4.2, unit: "s" },
    totalBlockingTime: { value: 480, unit: "ms" },
    cumulativeLayoutShift: { value: 0.18, unit: "" },
    speedIndex: { value: 3.9, unit: "s" },
  },
  opportunities: [
    {
      id: "server-response",
      title: "Reduce initial server response time",
      savings: "1.2 s",
      description: "Sample baseline finding for the UI preview.",
    },
    {
      id: "render-blocking",
      title: "Eliminate render-blocking resources",
      savings: "0.9 s",
      description: "Sample baseline finding for the UI preview.",
    },
    {
      id: "image-size",
      title: "Properly size images",
      savings: "0.7 s",
      description: "Sample baseline finding for the UI preview.",
    },
  ],
  diagnostics: [
    {
      id: "main-thread",
      title: "Minimize main-thread work",
      score: 0.3,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "js-execution",
      title: "Reduce JavaScript execution time",
      score: 0.45,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "network-requests",
      title: "Avoid chaining critical requests",
      score: 0.6,
      description: "Sample diagnostic value for the UI preview.",
    },
  ],
  passedAudits: [{ id: "dom-size", title: "Avoid an excessive DOM size" }],
});

/** Sample data — baseline report before Speed Scratcher, desktop. */
const baselineDesktop = report({
  device: "desktop",
  source: "mock",
  capturedAt: "2026-09-28T10:00:00.000Z",
  scores: { performance: 78, accessibility: 91, bestPractices: 84, seo: 88 },
  agenticBrowsing: { passed: 2, total: 3 },
  metrics: {
    firstContentfulPaint: { value: 1.9, unit: "s" },
    largestContentfulPaint: { value: 3.4, unit: "s" },
    totalBlockingTime: { value: 320, unit: "ms" },
    cumulativeLayoutShift: { value: 0.12, unit: "" },
    speedIndex: { value: 3.1, unit: "s" },
  },
  opportunities: [
    {
      id: "server-response",
      title: "Reduce initial server response time",
      savings: "0.8 s",
      description: "Sample baseline finding for the UI preview.",
    },
    {
      id: "render-blocking",
      title: "Eliminate render-blocking resources",
      savings: "0.6 s",
      description: "Sample baseline finding for the UI preview.",
    },
  ],
  diagnostics: [
    {
      id: "main-thread",
      title: "Minimize main-thread work",
      score: 0.42,
      description: "Sample diagnostic value for the UI preview.",
    },
    {
      id: "js-execution",
      title: "Reduce JavaScript execution time",
      score: 0.58,
      description: "Sample diagnostic value for the UI preview.",
    },
  ],
  passedAudits: [],
});

/**
 * Returns the four mock reports:
 * `{ current: { mobile, desktop }, baseline: { mobile, desktop } }`.
 */
export function getMockReports() {
  return {
    current: { mobile: currentMobile, desktop: currentDesktop },
    baseline: { mobile: baselineMobile, desktop: baselineDesktop },
  };
}