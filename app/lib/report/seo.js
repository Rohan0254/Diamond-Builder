// SEO & Site Health — pure helpers for the dashboard's right-hand panel.
//
// Every number here comes from audits Google Lighthouse ran as part of the same
// PageSpeed scan the rest of the dashboard uses: `normalize.js` stores the
// relevant audits on each report as `seoAudits`. A category with no stored
// audit data is reported as "not scanned" — a count is never invented and a
// healthy state is never claimed for something that was not measured.
//
// Some checks a merchant would expect here (a full 404 crawl, duplicate
// metadata) are not performed by Lighthouse; those stay explicitly unscanned
// with an explanation instead of a guessed number.

/** Severity of a single issue category. */
export const ISSUE_SEVERITY = {
  critical: "critical",
  warning: "warning",
  info: "info",
  healthy: "healthy",
};

/** Overall site health. `unknown` means nothing has been scanned yet. */
export const HEALTH_STATUS = {
  healthy: "healthy",
  warning: "warning",
  critical: "critical",
  unknown: "unknown",
};

/** The Lighthouse audit ids the panel reads. */
export const SEO_AUDIT_IDS = {
  imageAlt: "image-alt",
  redirects: "redirects",
  documentTitle: "document-title",
  metaDescription: "meta-description",
  crawlableAnchors: "crawlable-anchors",
  linkText: "link-text",
  canonical: "canonical",
};

/** Shown when a category was simply not part of the last scan. */
export const NOT_SCANNED_REASON =
  "This check was not part of the last scan. Run a PageSpeed test to include it.";

/**
 * The issue categories, in a fixed display order: the pinned categories from
 * `PRIMARY_ISSUE_KEYS` first (the ones the dashboard panel shows), then the
 * rest behind "View all issues". Nothing here is severity-sorted — the order is
 * stable so the panel never shuffles between scans.
 *
 * `audits` lists the Lighthouse audits whose failures make up the card's count
 * (with the label shown in the detail view); `criticalAt` is the failure count
 * at which the card turns red rather than amber. A category that needs a full
 * site crawl carries a `reason` and is always reported as not scanned.
 */
export const SEO_ISSUES = [
  {
    key: "images",
    title: "Image Alt Text",
    icon: "image-alt",
    description:
      "Improve image accessibility and help search engines understand your images.",
    unit: "image",
    criticalAt: 5,
    audits: [{ id: SEO_AUDIT_IDS.imageAlt, label: "Images without alt text" }],
  },
  {
    key: "metadata",
    title: "Meta Titles & Descriptions",
    icon: "search",
    description:
      "Identify metadata gaps that may affect search visibility and click-through rates.",
    unit: "missing tag",
    criticalAt: 2,
    audits: [
      { id: SEO_AUDIT_IDS.documentTitle, label: "Meta title" },
      { id: SEO_AUDIT_IDS.metaDescription, label: "Meta description" },
    ],
  },
  {
    key: "internalLinks",
    title: "Internal Links",
    icon: "link",
    description:
      "Review links search engines cannot crawl and anchors without descriptive text.",
    unit: "link",
    criticalAt: 5,
    audits: [
      {
        id: SEO_AUDIT_IDS.crawlableAnchors,
        label: "Links search engines cannot crawl",
      },
      { id: SEO_AUDIT_IDS.linkText, label: "Links without descriptive text" },
    ],
  },
  {
    key: "brokenLinks",
    title: "Broken Links (404)",
    icon: "alert-circle",
    description:
      "Identify broken URLs that may affect user experience and internal linking.",
    unit: "broken link",
    criticalAt: 1,
    audits: [],
    reason:
      "Finding 404s needs a full crawl of the storefront, which the PageSpeed scan does not run yet.",
  },
  {
    key: "redirects",
    title: "Redirects (301)",
    icon: "exchange",
    description: "Review redirects and identify unnecessary redirect chains.",
    unit: "redirect chain",
    criticalAt: 3,
    audits: [{ id: SEO_AUDIT_IDS.redirects, label: "Redirect chains" }],
  },
  {
    key: "canonical",
    title: "Canonical Tags",
    icon: "file",
    description: "Check for missing, invalid or conflicting canonical tags.",
    unit: "page",
    criticalAt: 1,
    audits: [{ id: SEO_AUDIT_IDS.canonical, label: "Canonical tag" }],
  },
];

/**
 * The categories pinned to the top of the dashboard panel, in this exact order.
 * The remaining categories are still checked and still counted — they sit
 * behind "View all issues".
 */
export const PRIMARY_ISSUE_KEYS = ["images", "metadata", "internalLinks"];

/**
 * Splits the categories into the pinned top group and the rest.
 *
 * The pinned group always follows `PRIMARY_ISSUE_KEYS` order, so the top of the
 * panel never reshuffles itself between scans. `secondary` keeps the definition
 * order and both groups keep their real counts (an unscanned category is still
 * listed rather than dropped).
 *
 * @returns {{primary: object[], secondary: object[]}}
 */
export function splitIssues(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const pin = (key) => {
    const index = PRIMARY_ISSUE_KEYS.indexOf(key);
    return index === -1 ? PRIMARY_ISSUE_KEYS.length : index;
  };

  const primary = list
    .filter((group) => PRIMARY_ISSUE_KEYS.includes(group?.key))
    .sort((a, b) => pin(a.key) - pin(b.key));
  const secondary = list.filter(
    (group) => !PRIMARY_ISSUE_KEYS.includes(group?.key),
  );

  return { primary, secondary };
}

/** Coerces a value to a finite number, or `null` for missing/invalid input. */
function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Finds one category definition by key, or `null`. */
export function getSeoIssue(key) {
  return SEO_ISSUES.find((issue) => issue.key === key) ?? null;
}

/**
 * Failure count for one stored Lighthouse audit.
 *
 * Returns `null` when the audit cannot answer the question (not part of the
 * scan, or a manual/errored audit) so the caller reports "not scanned" rather
 * than a zero it did not measure. A null score with no items is treated as
 * "nothing to report" — an informational audit is never dressed up as a
 * failure.
 */
export function auditFailures(entry) {
  if (!entry || typeof entry !== "object") return null;
  const mode = String(entry.scoreDisplayMode ?? "");
  if (mode === "manual" || mode === "error") return null;
  // The audit ran but the page has nothing to check (e.g. no images at all).
  if (mode === "notApplicable") return 0;

  const score = toNumber(entry.score);
  if (score === 1) return 0;

  const itemCount = toNumber(entry.itemCount);
  if (itemCount !== null && itemCount > 0) return itemCount;
  // A page-level audit (title / description / canonical) fails for the whole
  // page, so a failing score with no item list is exactly one issue.
  if (score !== null && score < 1) return 1;
  return 0;
}

/** Severity for a category from its failure count (`null` = not scanned). */
export function issueSeverity(definition, count) {
  if (count === null) return ISSUE_SEVERITY.info;
  if (count <= 0) return ISSUE_SEVERITY.healthy;
  if (count >= (definition?.criticalAt ?? 1)) return ISSUE_SEVERITY.critical;
  return ISSUE_SEVERITY.warning;
}

/**
 * Builds one panel card from the stored audits.
 *
 * `count` is `null` when none of the category's audits were part of the scan.
 * `parts` breaks the count down per audit (so "Meta title" and "Meta
 * description" get separate counts) and `findings` collects the affected URLs
 * for the detail view. Every `items` entry comes straight from the stored
 * Lighthouse audit — nothing is synthesised.
 */
export function buildIssue(definition, audits) {
  const def = definition ?? {};
  const parts = (def.audits ?? []).map(({ id, label }) => {
    const entry = audits && typeof audits === "object" ? audits[id] : null;
    const items = Array.isArray(entry?.items) ? entry.items : [];
    return {
      id,
      label: label ?? def.title ?? id,
      failures: auditFailures(entry),
      itemCount: entry ? toNumber(entry.itemCount) ?? items.length : null,
      items,
    };
  });

  const measured = parts.filter((part) => part.failures !== null);
  const scanned = measured.length > 0;
  const count = scanned
    ? measured.reduce((total, part) => total + part.failures, 0)
    : null;

  const findings = [];
  for (const part of parts) {
    if (part.failures === null || part.failures <= 0) continue;
    part.items.forEach((item, index) => {
      findings.push({
        key: `${part.id}-${index}`,
        audit: part.id,
        auditLabel: part.label,
        url: typeof item?.url === "string" ? item.url : null,
        label: typeof item?.label === "string" ? item.label : null,
      });
    });
  }

  return {
    key: def.key,
    title: def.title,
    icon: def.icon,
    description: def.description ?? "",
    unit: def.unit ?? "issue",
    scanned,
    count,
    severity: issueSeverity(def, count),
    // Why the category has no count, when it has none.
    reason: scanned ? null : def.reason ?? NOT_SCANNED_REASON,
    breakdown: parts.map((part) => ({
      id: part.id,
      label: part.label,
      failures: part.failures,
      itemCount: part.itemCount,
    })),
    findings,
  };
}

/**
 * Builds the whole panel state from a normalized report.
 *
 * Never throws and never invents a result: with no stored `seoAudits` (a report
 * captured before this panel existed, or a raw response without audits) every
 * category reports `scanned: false` and the overall status is `unknown`.
 *
 * @returns {{scanned: boolean, scannedAt: string|null, status: string,
 *   groups: object[], totals: object}}
 */
export function buildSiteHealth(report) {
  const source = report?.seoAudits;
  const audits =
    source && typeof source.audits === "object" ? source.audits : null;

  const groups = SEO_ISSUES.map((definition) => buildIssue(definition, audits));
  const scannedGroups = groups.filter((group) => group.scanned);
  const withIssues = scannedGroups.filter((group) => group.count > 0);
  const critical = scannedGroups.filter(
    (group) => group.severity === ISSUE_SEVERITY.critical,
  ).length;

  let status = HEALTH_STATUS.unknown;
  if (scannedGroups.length > 0) {
    if (critical > 0) status = HEALTH_STATUS.critical;
    else if (withIssues.length > 0) status = HEALTH_STATUS.warning;
    else status = HEALTH_STATUS.healthy;
  }

  return {
    scanned: scannedGroups.length > 0,
    scannedAt: typeof source?.scannedAt === "string" ? source.scannedAt : null,
    status,
    groups,
    totals: {
      checked: scannedGroups.length,
      notScanned: groups.length - scannedGroups.length,
      issues: withIssues.reduce((total, group) => total + group.count, 0),
      categories: withIssues.length,
      critical,
      warnings: withIssues.length - critical,
    },
  };
}

/**
 * Headline + supporting line for the health summary at the top of the panel.
 * The status is always the one derived from the scan — never a hardcoded green.
 */
export function buildHealthSummary(siteHealth) {
  const totals = siteHealth?.totals ?? {
    checked: 0,
    notScanned: 0,
    issues: 0,
    categories: 0,
    critical: 0,
    warnings: 0,
  };

  switch (siteHealth?.status) {
    case HEALTH_STATUS.critical:
      return {
        status: HEALTH_STATUS.critical,
        label: "Action needed",
        text: `${totals.issues} issue${
          totals.issues === 1 ? "" : "s"
        } found across ${totals.categories} of ${totals.checked} checks.`,
      };
    case HEALTH_STATUS.warning:
      return {
        status: HEALTH_STATUS.warning,
        label: "Needs review",
        text: `${totals.issues} issue${
          totals.issues === 1 ? "" : "s"
        } found across ${totals.categories} of ${totals.checked} checks.`,
      };
    case HEALTH_STATUS.healthy:
      return {
        status: HEALTH_STATUS.healthy,
        label: "Healthy",
        text: `All ${totals.checked} checks passed with no issues found.`,
      };
    default:
      return {
        status: HEALTH_STATUS.unknown,
        label: "Not scanned",
        text: "Run a PageSpeed test to scan this store for SEO and site health issues.",
      };
  }
}

/** "3 images" / "1 redirect chain" — a compact badge label for a category. */
export function issueCountLabel(group) {
  if (!group || group.count === null) return "Not scanned";
  if (group.count <= 0) return "Passed";
  const unit = group.unit ?? "issue";
  return `${group.count} ${unit}${group.count === 1 ? "" : "s"}`;
}

/** Plain label for one raw failure count (`null` = not measured). */
export function formatIssueCount(count) {
  if (count === null || count === undefined) return "Not scanned";
  if (count <= 0) return "None";
  return String(count);
}
