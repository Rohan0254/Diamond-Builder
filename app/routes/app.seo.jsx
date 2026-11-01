/* eslint-disable react/prop-types */
// SEO & Site Health — the full audit behind the dashboard panel.
//
// Read-only: it never starts a PageSpeed run (that lives on the Dashboard) and
// it never re-fetches a report. The device and the issue category can be seeded
// from the URL (`?device=…&category=…`) so a card on the dashboard opens its own
// audit, but switching between audits here is plain client-side state — the
// loader runs once per page load, never per tab.

import { useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadReportData } from "../report-data.server.js";
import Tabs, { DEVICE_OPTIONS } from "../components/report/Tabs.jsx";
import { REPORT_CSS } from "../lib/report/styles.js";
import {
  HEALTH_STATUS,
  SEO_ISSUES,
  buildHealthSummary,
  buildSiteHealth,
  formatIssueCount,
  issueCountLabel,
} from "../lib/report/seo.js";
import { formatReportDate } from "../lib/report/model.js";

export const loader = async ({ request }) => loadReportData(request, "seo.loader");

/** How many affected elements are listed before "Show all". */
const FINDINGS_PREVIEW = 5;

const HEALTH_ICONS = {
  [HEALTH_STATUS.healthy]: "check-circle",
  [HEALTH_STATUS.warning]: "alert-triangle",
  [HEALTH_STATUS.critical]: "alert-circle",
  [HEALTH_STATUS.unknown]: "search",
};

/** One audit section: the category header, its counts and the URLs it found. */
function AuditSection({ group }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? group.findings : group.findings.slice(0, FINDINGS_PREVIEW);
  const remaining = group.findings.length - shown.length;

  return (
    <article
      id={`seo-audit-${group.key}`}
      className={`psi-seo-audit psi-seo-audit--${group.severity}`}
      aria-labelledby={`seo-audit-${group.key}-title`}
    >
      <header className="psi-seo-audit__head">
        <span className="psi-seo__icon" aria-hidden="true">
          <s-icon type={group.icon} size={18} />
        </span>
        <div className="psi-seo-audit__titles">
          <s-heading id={`seo-audit-${group.key}-title`} level={3}>
            {group.title}
          </s-heading>
          <s-text color="subdued">{group.description}</s-text>
        </div>
        <span className={`psi-seo__badge psi-seo__badge--${group.severity}`}>
          {issueCountLabel(group)}
        </span>
      </header>

      {!group.scanned ? (
        <p className="psi-seo-audit__note">{group.reason}</p>
      ) : group.count === 0 ? (
        <p className="psi-seo-audit__note psi-seo-audit__note--ok">
          No issues found for this page in the last scan.
        </p>
      ) : (
        <div className="psi-seo-audit__body">
          {group.breakdown.length > 1 ? (
            <ul className="psi-seo-audit__breakdown">
              {group.breakdown.map((part) => (
                <li key={part.id}>
                  <span>{part.label}</span>
                  <strong>{formatIssueCount(part.failures)}</strong>
                </li>
              ))}
            </ul>
          ) : null}

          {group.findings.length > 0 ? (
            <>
              <ul className="psi-seo-audit__findings">
                {shown.map((finding) => (
                  <li key={finding.key}>
                    <span className="psi-seo-audit__finding-main">
                      {finding.url ?? finding.label ?? "Page-level issue"}
                    </span>
                    {finding.url && finding.label ? (
                      <span className="psi-seo-audit__finding-meta">
                        {finding.auditLabel}: {finding.label}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {remaining > 0 ? (
                <button
                  type="button"
                  className="psi-seo__link"
                  onClick={() => setShowAll(true)}
                >
                  Show all {group.findings.length}
                </button>
              ) : null}
            </>
          ) : (
            <p className="psi-seo-audit__note">
              The scan counted this issue for the scanned page but did not list
              individual elements.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function SeoReport() {
  const { reports, isSample, pagespeedConfigured, authError } = useLoaderData();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [device, setDevice] = useState(
    params.get("device") === "desktop" ? "desktop" : "mobile",
  );

  const report = reports.current[device] ?? reports.baseline[device] ?? null;
  const siteHealth = buildSiteHealth(report);
  const summary = buildHealthSummary(siteHealth);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const key = params.get("category");
    if (!key || key === "all") return;
    const target = document.getElementById(`seo-audit-${key}`);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [params]);

  return (
    <s-page heading="SEO & Site Health">
      <style>{REPORT_CSS}</style>

      <div className="psi-toolbar">
        <s-button onClick={() => navigate("/app")}>← Back to dashboard</s-button>
        <Tabs
          idPrefix="seo-device"
          label="Device"
          options={DEVICE_OPTIONS}
          value={device}
          onChange={setDevice}
        />
      </div>

      {authError && (
        <s-banner tone="critical" heading="Could not authenticate with Shopify">
          <s-text>{authError}</s-text>
        </s-banner>
      )}

      {!pagespeedConfigured && (
        <s-banner tone="warning" heading="PageSpeed testing is not configured">
          <s-text>
            Set PAGESPEED_API_KEY in the app&apos;s server environment and redeploy to run real
            tests.
          </s-text>
        </s-banner>
      )}

      {isSample && (
        <s-banner tone="info" heading="Showing sample data">
          <s-text>
            These findings are a sample preview. Run a PageSpeed test to see your
            store&apos;s real scan.
          </s-text>
        </s-banner>
      )}

      {!report ? (
        <div className="psi-ov__empty">
          <s-text color="subdued">
            No scan has been stored for this device yet. Run a PageSpeed test from
            the dashboard to create one.
          </s-text>
        </div>
      ) : (
        <>
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

          <p className="psi-seo-report__meta">
            {formatReportDate(report.capturedAt)
              ? `Scanned ${formatReportDate(report.capturedAt)}`
              : "Scan date not available"}
            {" · "}
            {device === "desktop" ? "Desktop" : "Mobile"}
            {" · "}
            {siteHealth.totals.checked} of {SEO_ISSUES.length} checks in this scan
          </p>

          <div className="psi-seo-report__list">
            {siteHealth.groups.map((group) => (
              <AuditSection key={group.key} group={group} />
            ))}
          </div>

          <p className="psi-seo__link-row">
            <button
              type="button"
              className="psi-seo__link psi-seo__link--primary"
              onClick={() => navigate(`/app/report?device=${device}`)}
            >
              See full performance report →
            </button>
          </p>
        </>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
