// Dashboard — the store's Performance Overview (Before vs. After chart, summary
// metrics and Lighthouse score cards). The full detailed report — the
// side-by-side Current/Before blocks and the comparison table — now lives on its
// own route, `/app/report`, linked from the Overview's "See more details".
//
// The "Analyze now" button posts to this route's action, which starts a
// background PageSpeed run server-side for mobile + desktop
// (`app/pagespeed.server.js`) and returns immediately. The heavy Google calls
// finish after the response, so the browser never waits on (or times out) the
// API. This page polls `/pagespeed-status` until the run completes — which also
// means a refresh mid-run keeps showing progress.
//
// While a run is in flight the dashboard also shows `SpeedRocket`, which hovers
// at the bottom of the screen and launches once the run lands.

import { useEffect, useRef } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdminOrDiagnose } from "../shopify.server";
import { startPageSpeedRun } from "../pagespeed.server";
import { loadReportData } from "../report-data.server.js";
import PerformanceOverview from "../components/report/PerformanceOverview.jsx";
import SpeedRocket from "../components/SpeedRocket.jsx";
import { REPORT_CSS } from "../lib/report/styles.js";

export const loader = async ({ request }) => loadReportData(request, "index.loader");

export const action = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "index.action");
  if (!auth.ok) return { ok: false, error: auth.error };

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "run-pagespeed") {
    return { ok: false, error: "Unsupported action." };
  }

  try {
    // Starts the run and returns immediately — the Google calls happen in the
    // background, so the browser never waits on (or times out) the PageSpeed API.
    return await startPageSpeedRun({
      shop: auth.context.session.shop,
      admin: auth.context.admin,
    });
  } catch (error) {
    console.error("[index.action] failed to start PageSpeed run", error);
    return {
      ok: false,
      error: "The PageSpeed test could not be started. Please try again in a moment.",
    };
  }
};

export default function Dashboard() {
  const {
    reports,
    history,
    isSample,
    pagespeedConfigured,
    run: initialRun,
    beforeSpeedReady,
    authError,
  } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  // The freshest run state: the polled value once it has loaded, else the
  // loader's value (which is what makes a refresh mid-run keep polling).
  const polledRun = statusFetcher.data ? statusFetcher.data.run : undefined;
  const run = polledRun === undefined ? initialRun : polledRun;
  const activeRun = Boolean(
    run && (run.status === "PENDING" || run.status === "RUNNING"),
  );

  const submitting = fetcher.state !== "idle";
  const isRunning = submitting || activeRun;

  // Until the automatic "before speed" baseline finishes there is nothing
  // meaningful to report, so show a loader instead of the sample preview.
  const initializing = !beforeSpeedReady && activeRun;

  // Runs we have personally seen in flight, so we only toast once, and only for
  // a run started/live in this session (not an old one found on page load).
  const seenActiveRuns = useRef(new Set());

  useEffect(() => {
    shopify.loading(submitting);
  }, [shopify, submitting]);

  // Surface a "could not start" error from the action.
  useEffect(() => {
    const data = fetcher.data;
    if (data?.error) shopify.toast.show(data.error, { isError: true });
  }, [fetcher.data, shopify]);

  // While a run is in flight, poll the lightweight status route.
  useEffect(() => {
    if (!activeRun) return undefined;
    const id = setInterval(() => {
      if (statusFetcher.state === "idle") statusFetcher.load("/pagespeed-status");
    }, 4000);
    return () => clearInterval(id);
  }, [activeRun, statusFetcher]);

  // When a run we watched finish, notify and refresh the report numbers.
  useEffect(() => {
    if (!run) return;
    if (run.status === "PENDING" || run.status === "RUNNING") {
      seenActiveRuns.current.add(run.id);
      return;
    }
    if (!seenActiveRuns.current.has(run.id)) return;
    seenActiveRuns.current.delete(run.id);
    if (run.status === "FAILED") {
      shopify.toast.show(run.error ?? "The PageSpeed test failed.", {
        isError: true,
      });
    } else {
      shopify.toast.show("PageSpeed test complete.");
    }
    revalidator.revalidate();
  }, [run, shopify, revalidator]);

  const runTest = () => fetcher.submit({ intent: "run-pagespeed" }, { method: "POST" });

  return (
    <>
      {/* Rides 70px above the bottom of the screen while a run is in flight,
          then launches once it lands. Rendered once, outside the branch below,
          so it survives the switch from the first-load "measuring" state to the
          dashboard instead of remounting and missing its launch. */}
      <SpeedRocket active={isRunning} />

      <s-page heading="Dashboard">
        <style>{REPORT_CSS}</style>

        {/* First load: the baseline is still being measured. Show a loader
            instead of the sample preview so the merchant sees a clear "in
            progress" state; the poller above revalidates the moment the run
            finishes. */}
        {initializing ? (
          <div className="psi-loading">
            <s-spinner size="large" accessibilityLabel="Measuring your store" />
            <s-heading>Measuring your store&apos;s speed…</s-heading>
            <s-text color="subdued">
              We&apos;re running a first PageSpeed test to capture your store&apos;s
              current speed before Speed Scratcher is installed. This can take up
              to a minute — the page updates automatically when it&apos;s ready.
            </s-text>
          </div>
        ) : (
          <>
            <div className="psi-toolbar">
              <s-button
                variant="primary"
                loading={isRunning}
                disabled={isRunning || !pagespeedConfigured}
                onClick={runTest}
              >
                {isRunning ? "Analyzing…" : "Analyze now"}
              </s-button>
              {isRunning && (
                <s-text color="subdued">
                  Running in the background — you can leave this page and come back.
                </s-text>
              )}
            </div>

            {authError && (
              <s-banner tone="critical" heading="Could not authenticate with Shopify">
                {authError}
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
                  These numbers are a sample preview. Run a PageSpeed test to see your store&apos;s real
                  report.
                </s-text>
              </s-banner>
            )}

            <PerformanceOverview
              beforeMobileReport={reports.baseline.mobile}
              afterMobileReport={reports.current.mobile}
              beforeDesktopReport={reports.baseline.desktop}
              afterDesktopReport={reports.current.desktop}
              mobileHistory={history?.mobile ?? []}
              desktopHistory={history?.desktop ?? []}
              detailsHref="/app/report"
              isSample={isSample}
            />
          </>
        )}
      </s-page>
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
