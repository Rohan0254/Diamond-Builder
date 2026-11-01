// Performance details — the full PageSpeed report for the store.
//
// This route holds the parts of the old dashboard that are too dense for the
// Home page: the side-by-side "Current" vs "Before" report (score summary,
// metrics, store preview and the expandable audits) and the Before & After
// comparison table. The Home route now shows just the Performance Overview and
// links here via "See more details".
//
// Read-only — it never starts a PageSpeed run (that lives on the Dashboard). The
// device selected on the Overview is carried over as `?device=mobile|desktop`
// so the detailed report opens on the same device.

import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadReportData } from "../report-data.server.js";
import { REPORT_CSS } from "../lib/report/styles.js";
import SideBySideReport from "../components/report/SideBySideReport.jsx";
import ComparisonSection from "../components/report/ComparisonSection.jsx";

export const loader = async ({ request }) => loadReportData(request, "report.loader");

export default function ReportDetails() {
  const { reports, isSample, pagespeedConfigured, authError } = useLoaderData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // The Overview's Mobile/Desktop toggle is passed through so the detailed
  // report opens on the same device. Anything else falls back to Desktop.
  const requested = searchParams.get("device");
  const initialDevice = requested === "mobile" ? "mobile" : "desktop";

  const hasCurrent = Boolean(reports.current.mobile || reports.current.desktop);

  return (
    <s-page heading="Performance details">
      <style>{REPORT_CSS}</style>

      <div className="psi-toolbar">
        <s-button onClick={() => navigate("/app")}>← Back to dashboard</s-button>
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
            These numbers are a sample preview. Run a PageSpeed test from the dashboard to see your
            store&apos;s real report.
          </s-text>
        </s-banner>
      )}

      <SideBySideReport
        idPrefix="report"
        reports={reports}
        initialDevice={initialDevice}
      />

      <hr className="psi-divider" />

      <ComparisonSection current={reports.current} baseline={reports.baseline} />

      {!isSample && !hasCurrent && (
        <p className="psi-note">
          Your before score is captured. Run the PageSpeed test again after installing the
          optimization script to see your after score and the improvement.
        </p>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
