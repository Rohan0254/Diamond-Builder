// Shared report-page data loader.
//
// Both the Home dashboard and the Performance details page need the same data:
// the stored Before/Current PageSpeed reports, the in-flight run state and the
// sample/configuration flags. Keeping the loader here means the two routes can
// never drift apart.
//
// It never starts a run — the "Analyze now" action lives on the Dashboard — and
// it never invents numbers: with no real baseline yet, it returns the
// clearly-flagged sample fixtures instead.

import { authenticateAdminOrDiagnose } from "./shopify.server";
import { emptyReport } from "./lib/report/model.js";
import { getMockReports } from "./lib/report/fixtures.js";
import {
  REPORT_HISTORY_DAYS,
  getLatestReports,
  getReportHistory,
  getRunState,
  isPageSpeedConfigured,
} from "./pagespeed.server";

/**
 * Loads everything a report page needs. `tag` only labels the error logs.
 */
export async function loadReportData(request, tag = "report") {
  const auth = await authenticateAdminOrDiagnose(request, tag);

  if (!auth.ok) {
    return {
      reports: getMockReports(),
      history: { mobile: [], desktop: [] },
      isSample: true,
      pagespeedConfigured: isPageSpeedConfigured(),
      run: null,
      beforeSpeedReady: false,
      authError: auth.error,
    };
  }

  const { session } = auth.context;

  let stored = {
    current: { mobile: null, desktop: null },
    baseline: { mobile: null, desktop: null },
  };
  try {
    stored = await getLatestReports(session.shop);
  } catch (error) {
    console.error(`[${tag}] failed to load PageSpeed reports`, error);
  }

  // The "before speed" baseline exists as soon as the first report is stored
  // (the automatic run kicked off at install, or a manual run). It is the fixed
  // "Before" score and never updates.
  const beforeSpeedReady = Boolean(stored.baseline.mobile || stored.baseline.desktop);

  // The in-flight / just-finished run (if any). Persisted, so the Dashboard
  // keeps polling it after a refresh.
  let run = null;
  try {
    run = await getRunState(session.shop);
  } catch (error) {
    console.error(`[${tag}] failed to load run state`, error);
  }

  // No real run yet → show the sample preview with a clear banner.
  if (!beforeSpeedReady) {
    return {
      reports: getMockReports(),
      history: { mobile: [], desktop: [] },
      isSample: true,
      pagespeedConfigured: isPageSpeedConfigured(),
      run,
      beforeSpeedReady: false,
      authError: null,
    };
  }

  // The install capture is the fixed "Before" score; "Current" only appears
  // once a later run (after the script is installed) has been recorded. A device
  // with no report is filled with a neutral placeholder.
  const hasCurrent = Boolean(stored.current.mobile || stored.current.desktop);
  const baseline = {
    mobile: stored.baseline.mobile ?? emptyReport({ device: "mobile" }),
    desktop: stored.baseline.desktop ?? emptyReport({ device: "desktop" }),
  };
  const current = hasCurrent
    ? {
        mobile: stored.current.mobile ?? emptyReport({ device: "mobile" }),
        desktop: stored.current.desktop ?? emptyReport({ device: "desktop" }),
      }
    : { mobile: null, desktop: null };

  // The chart history: the last REPORT_HISTORY_DAYS of reports per device, so
  // the 7/15/30-day range filter can slice it without another request.
  let history = { mobile: [], desktop: [] };
  try {
    history = await getReportHistory(session.shop, { days: REPORT_HISTORY_DAYS });
  } catch (error) {
    console.error(`[${tag}] failed to load report history`, error);
  }

  return {
    reports: { current, baseline },
    history,
    isSample: false,
    pagespeedConfigured: isPageSpeedConfigured(),
    run,
    beforeSpeedReady: true,
    authError: null,
  };
}
