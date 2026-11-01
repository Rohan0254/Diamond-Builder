import test from "node:test";
import assert from "node:assert/strict";

import { emptyReport } from "./model.js";
import { getMockReports } from "./fixtures.js";
import {
  HEALTH_STATUS,
  ISSUE_SEVERITY,
  NOT_SCANNED_REASON,
  PRIMARY_ISSUE_KEYS,
  SEO_AUDIT_IDS,
  SEO_ISSUES,
  auditFailures,
  buildHealthSummary,
  buildIssue,
  buildSiteHealth,
  formatIssueCount,
  getSeoIssue,
  issueCountLabel,
  issueSeverity,
  splitIssues,
} from "./seo.js";

const breakdown = (group, id) =>
  group.breakdown.find((part) => part.id === id) ?? null;

// ------------------------------------------------------------- definitions

test("the pinned categories lead the definition order", () => {
  assert.deepEqual(PRIMARY_ISSUE_KEYS, ["images", "metadata", "internalLinks"]);
  assert.deepEqual(
    SEO_ISSUES.slice(0, PRIMARY_ISSUE_KEYS.length).map((issue) => issue.key),
    PRIMARY_ISSUE_KEYS,
  );
  // Every category is still defined — pinning reorders, it never drops.
  assert.deepEqual(
    SEO_ISSUES.map((issue) => issue.key),
    [
      "images",
      "metadata",
      "internalLinks",
      "brokenLinks",
      "redirects",
      "canonical",
    ],
  );
});

test("getSeoIssue finds a category and returns null for unknown keys", () => {
  assert.equal(getSeoIssue("internalLinks").title, "Internal Links");
  assert.equal(getSeoIssue("nope"), null);
});

// ------------------------------------------------------------- splitIssues

test("splitIssues pins the top categories in a fixed order", () => {
  const groups = SEO_ISSUES.map((issue) => ({ key: issue.key, count: 0 }));
  const { primary, secondary } = splitIssues(groups);

  assert.deepEqual(
    primary.map((group) => group.key),
    ["images", "metadata", "internalLinks"],
  );
  assert.deepEqual(
    secondary.map((group) => group.key),
    ["brokenLinks", "redirects", "canonical"],
  );
});

test("splitIssues keeps the pinned order whatever order it is handed", () => {
  const shuffled = [
    { key: "canonical", count: 1 },
    { key: "internalLinks", count: 0 },
    { key: "images", count: 9 },
    { key: "metadata", count: 1 },
  ];
  const { primary, secondary } = splitIssues(shuffled);

  assert.deepEqual(
    primary.map((group) => group.key),
    ["images", "metadata", "internalLinks"],
  );
  assert.deepEqual(
    secondary.map((group) => group.key),
    ["canonical"],
  );
  // Counts ride along untouched — the order is about placement, not severity.
  assert.equal(primary[0].count, 9);
  assert.equal(primary[1].count, 1);
});

test("splitIssues tolerates empty and invalid input", () => {
  assert.deepEqual(splitIssues([]), { primary: [], secondary: [] });
  assert.deepEqual(splitIssues(null), { primary: [], secondary: [] });
  assert.deepEqual(splitIssues(undefined), { primary: [], secondary: [] });
});

// ------------------------------------------------------------ auditFailures

test("auditFailures reports nothing it did not measure", () => {
  // Missing / malformed entries.
  assert.equal(auditFailures(null), null);
  assert.equal(auditFailures(undefined), null);
  assert.equal(auditFailures("nope"), null);
  // Audits the scan cannot answer.
  assert.equal(
    auditFailures({ score: null, scoreDisplayMode: "manual" }),
    null,
  );
  assert.equal(auditFailures({ score: null, scoreDisplayMode: "error" }), null);
});

test("auditFailures counts real failures only", () => {
  assert.equal(
    auditFailures({ score: 1, scoreDisplayMode: "binary", itemCount: 0, items: [] }),
    0,
  );
  assert.equal(
    auditFailures({ score: null, scoreDisplayMode: "notApplicable", items: [] }),
    0,
  );
  assert.equal(
    auditFailures({
      score: 0,
      scoreDisplayMode: "binary",
      itemCount: 3,
      items: [{}, {}, {}],
    }),
    3,
  );
  // A page-level audit fails for the page as a whole, so it counts once.
  assert.equal(
    auditFailures({ score: 0, scoreDisplayMode: "binary", itemCount: 0, items: [] }),
    1,
  );
  assert.equal(
    auditFailures({ score: 0.5, scoreDisplayMode: "numeric", items: [] }),
    1,
  );
  // An informational audit with nothing to report is not a failure.
  assert.equal(
    auditFailures({ score: null, scoreDisplayMode: "informative", items: [] }),
    0,
  );
});

// ----------------------------------------------------------- issueSeverity

test("issueSeverity escalates at the category threshold", () => {
  const images = getSeoIssue("images"); // criticalAt: 5
  assert.equal(issueSeverity(images, null), ISSUE_SEVERITY.info);
  assert.equal(issueSeverity(images, 0), ISSUE_SEVERITY.healthy);
  assert.equal(issueSeverity(images, 1), ISSUE_SEVERITY.warning);
  assert.equal(issueSeverity(images, 4), ISSUE_SEVERITY.warning);
  assert.equal(issueSeverity(images, 5), ISSUE_SEVERITY.critical);
  assert.equal(issueSeverity(undefined, 1), ISSUE_SEVERITY.critical);
});

// --------------------------------------------------------------- buildIssue

test("buildIssue sums its audits into one count with a breakdown", () => {
  const metadata = buildIssue(getSeoIssue("metadata"), {
    [SEO_AUDIT_IDS.documentTitle]: {
      score: 0,
      scoreDisplayMode: "binary",
      itemCount: 0,
      items: [],
    },
    [SEO_AUDIT_IDS.metaDescription]: {
      score: 0,
      scoreDisplayMode: "binary",
      itemCount: 0,
      items: [],
    },
  });

  assert.equal(metadata.scanned, true);
  assert.equal(metadata.count, 2);
  assert.equal(metadata.unit, "missing tag");
  assert.equal(metadata.severity, ISSUE_SEVERITY.critical); // criticalAt: 2
  assert.equal(metadata.reason, null);
  assert.deepEqual(
    metadata.breakdown.map((part) => [part.label, part.failures]),
    [
      ["Meta title", 1],
      ["Meta description", 1],
    ],
  );
});

test("buildIssue carries the affected URLs and never invents any", () => {
  const links = buildIssue(getSeoIssue("internalLinks"), {
    [SEO_AUDIT_IDS.crawlableAnchors]: {
      score: 1,
      scoreDisplayMode: "binary",
      itemCount: 0,
      items: [],
    },
    [SEO_AUDIT_IDS.linkText]: {
      score: 0,
      scoreDisplayMode: "binary",
      itemCount: 2,
      items: [
        { url: "https://example.com/a", label: "Shop" },
        { url: null, label: "Read more" },
      ],
    },
  });

  assert.equal(links.count, 2);
  assert.equal(links.findings.length, 2);
  assert.deepEqual(
    links.findings.map((finding) => [finding.auditLabel, finding.url]),
    [
      ["Links without descriptive text", "https://example.com/a"],
      ["Links without descriptive text", null],
    ],
  );
});

test("buildIssue explains an unscanned category instead of showing zero", () => {
  const broken = buildIssue(getSeoIssue("brokenLinks"), null);

  assert.equal(broken.scanned, false);
  assert.equal(broken.count, null);
  assert.equal(broken.severity, ISSUE_SEVERITY.info);
  assert.match(broken.reason, /full crawl/);
  assert.deepEqual(broken.breakdown, []);
  assert.deepEqual(broken.findings, []);
});

test("buildIssue falls back to the generic reason when a scan just missed it", () => {
  const images = buildIssue(getSeoIssue("images"), {});
  assert.equal(images.scanned, false);
  assert.equal(images.reason, NOT_SCANNED_REASON);
});

// ---------------------------------------------------------- buildSiteHealth

test("buildSiteHealth reports the categories in the definition order", () => {
  const siteHealth = buildSiteHealth(getMockReports().current.mobile);

  assert.deepEqual(
    siteHealth.groups.map((group) => group.key),
    ["images", "metadata", "internalLinks", "brokenLinks", "redirects", "canonical"],
  );
  // The panel takes the top group straight off `groups`, ranked is gone.
  assert.equal(siteHealth.ranked, undefined);
  assert.deepEqual(
    splitIssues(siteHealth.groups).primary.map((group) => group.key),
    PRIMARY_ISSUE_KEYS,
  );
});

test("buildSiteHealth counts what the sample scan actually found", () => {
  const siteHealth = buildSiteHealth(getMockReports().current.mobile);
  const { primary, secondary } = splitIssues(siteHealth.groups);

  assert.equal(siteHealth.scanned, true);
  assert.equal(siteHealth.scannedAt, "2026-10-14T09:12:00.000Z");

  const images = primary[0];
  assert.equal(images.count, 2);
  assert.equal(issueCountLabel(images), "2 images");
  assert.equal(images.severity, ISSUE_SEVERITY.warning);

  const metadata = primary[1];
  assert.equal(metadata.count, 1);
  assert.equal(issueCountLabel(metadata), "1 missing tag");
  assert.equal(breakdown(metadata, SEO_AUDIT_IDS.documentTitle).failures, 0);

  const links = primary[2];
  assert.equal(links.count, 3);
  assert.equal(issueCountLabel(links), "3 links");

  // A category Lighthouse cannot answer stays unscanned rather than zero.
  const broken = secondary[0];
  assert.equal(broken.scanned, false);
  assert.equal(issueCountLabel(broken), "Not scanned");

  assert.equal(siteHealth.totals.checked, 5);
  assert.equal(siteHealth.totals.notScanned, 1);
  assert.equal(siteHealth.totals.issues, 6);
  assert.equal(siteHealth.totals.categories, 3);
  assert.equal(siteHealth.totals.critical, 0);
});

test("buildSiteHealth with no stored audits is unknown, never healthy", () => {
  const siteHealth = buildSiteHealth(emptyReport());

  assert.equal(siteHealth.scanned, false);
  assert.equal(siteHealth.status, HEALTH_STATUS.unknown);
  assert.equal(siteHealth.scannedAt, null);
  assert.equal(siteHealth.totals.checked, 0);
  assert.equal(siteHealth.totals.notScanned, SEO_ISSUES.length);
  assert.ok(siteHealth.groups.every((group) => group.count === null));

  // Tolerates junk input as well.
  assert.equal(buildSiteHealth(null).status, HEALTH_STATUS.unknown);
  assert.equal(buildSiteHealth({ seoAudits: "nope" }).status, HEALTH_STATUS.unknown);
});

test("buildSiteHealth turns critical when a category crosses its threshold", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    url: `https://example.com/${index}`,
    label: `img-${index}`,
  }));
  const siteHealth = buildSiteHealth({
    seoAudits: {
      scannedAt: "2026-10-14T09:12:00.000Z",
      audits: {
        [SEO_AUDIT_IDS.imageAlt]: {
          score: 0,
          scoreDisplayMode: "binary",
          itemCount: 5,
          items,
        },
      },
    },
  });

  assert.equal(siteHealth.groups[0].severity, ISSUE_SEVERITY.critical);
  assert.equal(siteHealth.status, HEALTH_STATUS.critical);
  assert.equal(siteHealth.totals.critical, 1);
});

// ------------------------------------------------------- buildHealthSummary

test("buildHealthSummary never shows green while issues exist", () => {
  const fromReport = (report) => buildHealthSummary(buildSiteHealth(report));

  const critical = fromReport({
    seoAudits: {
      scannedAt: null,
      audits: {
        [SEO_AUDIT_IDS.canonical]: {
          score: 0,
          scoreDisplayMode: "binary",
          itemCount: 0,
          items: [],
        },
      },
    },
  });
  assert.equal(critical.status, HEALTH_STATUS.critical);
  assert.equal(critical.label, "Action needed");
  assert.match(critical.text, /1 issue found/);

  const warning = fromReport(getMockReports().current.mobile);
  assert.equal(warning.status, HEALTH_STATUS.warning);
  assert.equal(warning.label, "Needs review");

  const healthy = fromReport({
    seoAudits: {
      scannedAt: null,
      audits: {
        [SEO_AUDIT_IDS.imageAlt]: {
          score: 1,
          scoreDisplayMode: "binary",
          itemCount: 0,
          items: [],
        },
      },
    },
  });
  assert.equal(healthy.status, HEALTH_STATUS.healthy);
  assert.equal(healthy.label, "Healthy");

  const unknown = buildHealthSummary(buildSiteHealth(null));
  assert.equal(unknown.status, HEALTH_STATUS.unknown);
  assert.equal(unknown.label, "Not scanned");
});

// ---------------------------------------------------------------- labelling

test("issueCountLabel speaks in the category's own unit", () => {
  assert.equal(issueCountLabel({ count: 1, unit: "redirect chain" }), "1 redirect chain");
  assert.equal(issueCountLabel({ count: 2, unit: "redirect chain" }), "2 redirect chains");
  assert.equal(issueCountLabel({ count: 3, unit: "broken link" }), "3 broken links");
  assert.equal(issueCountLabel({ count: 0, unit: "image" }), "Passed");
  assert.equal(issueCountLabel({ count: null, unit: "image" }), "Not scanned");
  assert.equal(issueCountLabel(null), "Not scanned");
});

test("formatIssueCount labels raw audit numbers", () => {
  assert.equal(formatIssueCount(0), "None");
  assert.equal(formatIssueCount(7), "7");
  assert.equal(formatIssueCount(null), "Not scanned");
  assert.equal(formatIssueCount(undefined), "Not scanned");
});
