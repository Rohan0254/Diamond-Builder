/* eslint-disable react/prop-types */
// SEO & Site Health — the dashboard's right-hand column.
//
// Everything shown here is derived from the last stored PageSpeed report (the
// Lighthouse audits `normalize.js` keeps as `seoAudits`). Counts are never
// invented: a category the scan could not answer says "Not scanned", and the
// health summary reflects the real scan result — it never shows green while
// issues exist.
//
// The panel is presentational only. All the arithmetic (counts, severity,
// headline) lives in `app/lib/report/seo.js`; clicking a card routes to the
// matching audit on `/app/seo`, which reads the same stored report.
//
// The visible cards are a fixed set (Image Alt Text, Meta Titles &
// Descriptions, Internal Links) rather than a relevance ranking, so the top of
// the panel does not reshuffle between scans. Every other category stays one
// click away behind "View all issues".

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  HEALTH_STATUS,
  buildHealthSummary,
  buildSiteHealth,
  issueCountLabel,
  splitIssues,
} from "../../lib/report/seo.js";

/** Icon per overall health status (all names exist in Polaris' icon set). */
const HEALTH_ICONS = {
  [HEALTH_STATUS.healthy]: "check-circle",
  [HEALTH_STATUS.warning]: "alert-triangle",
  [HEALTH_STATUS.critical]: "alert-circle",
  [HEALTH_STATUS.unknown]: "search",
};

/** Health summary shown at the top of the panel. */
function HealthSummary({ siteHealth }) {
  const summary = buildHealthSummary(siteHealth);
  return (
    <div className={`psi-seo__health psi-seo__health--${summary.status}`}>
      <s-icon
        type={HEALTH_ICONS[summary.status] ?? "search"}
        size={20}
        aria-hidden="true"
      />
      <div className="psi-seo__health-text">
        <span className="psi-seo__health-label">{summary.label}</span>
        <span className="psi-seo__health-detail">{summary.text}</span>
      </div>
    </div>
  );
}

/** One clickable issue category card. */
function IssueCard({ group, onOpen }) {
  const label = issueCountLabel(group);
  return (
    <button
      type="button"
      className={`psi-seo__card psi-seo__card--${group.severity}`}
      onClick={onOpen}
    >
      <span className="psi-seo__icon" aria-hidden="true">
        <s-icon type={group.icon} size={18} />
      </span>
      <span className="psi-seo__card-body">
        <span className="psi-seo__card-top">
          <span className="psi-seo__card-title">{group.title}</span>
          <span className={`psi-seo__badge psi-seo__badge--${group.severity}`}>
            {label}
          </span>
        </span>
        <span className="psi-seo__card-desc">{group.description}</span>
      </span>
      <s-icon
        type="chevron-right"
        size={16}
        className="psi-seo__chevron"
        aria-hidden="true"
      />
    </button>
  );
}

export default function SeoHealthPanel({
  report = null,
  device = "mobile",
  seoHref = "/app/seo",
}) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const siteHealth = buildSiteHealth(report);
  const { primary, secondary } = splitIssues(siteHealth.groups);
  const visible = showAll ? [...primary, ...secondary] : primary;
  const hasMore = secondary.length > 0;

  const openIssue = (key) => {
    const separator = seoHref.includes("?") ? "&" : "?";
    navigate(`${seoHref}${separator}device=${device}&category=${key}`);
  };

  return (
    <section className="psi-seo" aria-labelledby="seo-health-heading">
      <div className="psi-seo__head">
        <s-heading id="seo-health-heading" level={2}>
          SEO &amp; Site Health
        </s-heading>
        {/* <s-text color="subdued">
          Find and fix issues that can impact your store performance.
        </s-text> */}
      </div>

      <HealthSummary siteHealth={siteHealth} />

      <ul className="psi-seo__list">
        {visible.map((group) => (
          <li key={group.key}>
            <IssueCard group={group} onOpen={() => openIssue(group.key)} />
          </li>
        ))}
      </ul>

      <div className="psi-seo__footer">
        {hasMore ? (
          <button
            type="button"
            className="psi-seo__link"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? "Show fewer issues"
              : `View all issues (${siteHealth.groups.length})`}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="psi-seo__link psi-seo__link--primary"
          onClick={() => openIssue(primary[0]?.key ?? "images")}
        >
          Open full SEO report →
        </button>
      </div>
    </section>
  );
}
