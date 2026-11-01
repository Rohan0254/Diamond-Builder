import { useCallback, useEffect, useRef, useState } from "react";
import {
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticateAdminOrDiagnose } from "../shopify.server";
import {
  reconcileIfTracked,
  syncSubscriptionFromChargeId,
} from "../billing.server";
import { ensureShopProfile } from "../shop-profile.server";
import { getLatestSetupVerification } from "../setup.server";
import { isTerminalStatus } from "../lib/billing";
import NavLoadingShimmer from "../components/NavLoadingShimmer.jsx";
import { SHELL_CSS } from "../lib/shell-styles.js";

// Pages a shop can reach before it has selected a plan.
const NO_PLAN_PATHS = new Set(["/app/plan", "/app/help"]);


/**
 * Removes the one-shot `charge_id` Shopify appends to a billing return URL so a
 * post-approval redirect doesn't carry it onto the next navigation.
 */
function dropChargeId(search) {
  const params = new URLSearchParams(search);
  params.delete("charge_id");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const loader = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "app.loader");

  // If authentication itself fails (e.g. rejected token exchange), surface a
  // readable message instead of a sanitized 500. The plan page and everything
  // under /app lives behind this shell, so this is where the error must stop.
  if (!auth.ok) {
    return {
      // eslint-disable-next-line no-undef
      apiKey: process.env.SHOPIFY_API_KEY || "",
      authError: auth.error,
    };
  }

  const { admin, session } = auth.context;

  const url = new URL(request.url);
  // Normalize so `/app/` behaves like `/app`.
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  // Shopify appends `charge_id` when it reloads the app after the subscription
  // approval page. Persist that exact charge so the plan is recognised even
  // before the `app_subscriptions/update` webhook arrives or when the local
  // PENDING row is missing/points at an older attempt.
  const chargeId = url.searchParams.get("charge_id");

  // Reconcile the local subscription mirror with Shopify whenever the app shell
  // loads. This is what verifies an approval after the merchant returns from
  // Shopify's confirmation page; it is a no-op for shops with no billing history.
  let subscription = null;
  try {
    subscription = chargeId
      ? await syncSubscriptionFromChargeId(admin, session.shop, chargeId)
      : await reconcileIfTracked(admin, session.shop);
  } catch (error) {
    console.error("Failed to reconcile subscription", error);
  }

  // Capture / refresh the merchant's shop profile. The `afterAuth` hook does
  // this on install; this also covers shops installed before the feature and
  // keeps the record fresh. Best-effort — never blocks the page.
  try {
    await ensureShopProfile({ shop: session.shop, admin });
  } catch (error) {
    console.error("Failed to sync shop profile", error);
  }

  const status = subscription?.status ?? null;
  // A plan counts as "taken" as soon as a pending or active subscription exists.
  // Only declined/cancelled/expired records fall back to the two-tab state.
  const hasPlan = Boolean(subscription) && !isTerminalStatus(status);

  // Shops without a plan only get Plan + Help; anything else bounces to Plan.
  if (!hasPlan && !NO_PLAN_PATHS.has(pathname)) {
    throw redirect(`/app/plan${url.search}`);
  }

  // Setup is a one-time step. Until the script is verified, the dashboard isn't
  // available: Home is hidden from the nav and opening the app (the dashboard)
  // lands on Setup instead.
  let setupComplete = false;
  if (hasPlan) {
    try {
      const record = await getLatestSetupVerification(session.shop);
      setupComplete = record?.overallStatus === "complete";
    } catch (error) {
      console.error("Failed to check setup status", error);
    }
  }

  if (hasPlan && !setupComplete && pathname === "/app") {
    throw redirect(`/app/setup${url.search}`);
  }

  // Returned from Shopify's approval page: now that the charge is saved, land on
  // the one-time Setup step. The return URL already points here for a first
  // activation; this also guarantees Setup is where the merchant lands after
  // paying (and recovers the case where the embedded reload came back on another
  // `/app/*` page).
  if (chargeId && hasPlan && pathname !== "/app/setup") {
    throw redirect(`/app/setup${dropChargeId(url.search)}`);
  }

  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  return { apiKey, authError: null, hasPlan, setupComplete };
};

export default function App() {
  const { apiKey, authError, hasPlan, setupComplete } = useLoaderData();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();

  // The control a page load is running for. While it is set, that control
  // shimmers in place (see `NavLoadingShimmer`).
  const [pendingTarget, setPendingTarget] = useState(null);
  const lastClick = useRef(null);
  const safetyTimer = useRef(null);

  const showPending = useCallback((element) => {
    setPendingTarget(element);
    // Safety net: if the frame never navigates, never leave a control shimmering.
    window.clearTimeout(safetyTimer.current);
    safetyTimer.current = window.setTimeout(
      () => setPendingTarget(null),
      10000,
    );
  }, []);

  const clearPending = useCallback(() => {
    window.clearTimeout(safetyTimer.current);
    safetyTimer.current = null;
    setPendingTarget(null);
  }, []);

  // Which control did the click land on? Polaris web components paint inside
  // shadow roots (sometimes closed ones), so the composed path is the only
  // reliable way to find the button or link underneath the pointer. The first
  // match is the innermost one — the thing that was actually drawn.
  useEffect(() => {
    const onClick = (event) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const path =
        typeof event.composedPath === "function"
          ? event.composedPath()
          : [event.target];
      const element = path.find((node) => {
        if (!(node instanceof Element)) return false;
        const tag = node.tagName.toLowerCase();
        return (
          tag === "button" ||
          tag === "a" ||
          tag === "s-button" ||
          tag === "s-link" ||
          node.getAttribute?.("role") === "button" ||
          node.hasAttribute?.("href")
        );
      });
      if (!element) return;

      // Remember it: a button that calls navigate() only becomes a page load a
      // moment later, when React Router's state changes.
      lastClick.current = { element, at: Date.now() };

      // Anchors (the app nav, any `s-link`) are handed to App Bridge and reload
      // the embedded frame, so they never reach React Router's state — start the
      // shimmer straight away for those.
      const href = element.getAttribute?.("href");
      if (!href || element.hasAttribute?.("download")) return;
      if ((element.getAttribute("target") ?? "") === "_blank") return;

      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // A link back to the page you are already on is not a page load.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      showPending(element);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [showPending]);

  // A button that calls navigate(): React Router only starts moving a moment
  // after the click, so tie the shimmer to the navigation itself.
  useEffect(() => {
    if (navigation.state === "idle") {
      clearPending(); // nothing is loading any more
      return;
    }
    const click = lastClick.current;
    if (!click || Date.now() - click.at > 2000) return;
    if (!click.element?.isConnected) return;
    showPending(click.element);
  }, [navigation.state, showPending, clearPending]);

  // The new page is on screen: the old control is gone anyway, but never leave
  // the shimmer behind if a route change lands without a state flip.
  useEffect(() => {
    clearPending();
  }, [location.pathname, location.search, clearPending]);

  useEffect(() => () => window.clearTimeout(safetyTimer.current), []);

  // Safety net for the embedded load: if the dashboard is rendered while the
  // script is still unverified (e.g. the App Bridge bootstrap skipped the server
  // redirect), pivot to Setup client-side. A billing return (`charge_id`) always
  // lands on Setup once the plan is recognised. Once verified this is a no-op.
  useEffect(() => {
    const returningFromApproval = new URLSearchParams(location.search).has(
      "charge_id",
    );
    const shouldSetup =
      hasPlan &&
      location.pathname !== "/app/setup" &&
      (returningFromApproval ||
        (location.pathname === "/app" && !setupComplete));
    if (shouldSetup) {
      navigate("/app/setup", { replace: true });
    }
  }, [hasPlan, setupComplete, location.pathname, location.search, navigate]);

  // Plain HTML fallback: the Polaris web components need AppProvider context,
  // so we don't render the app chrome when we couldn't authenticate.
  if (authError) {
    return (
      <div
        style={{
          maxWidth: "640px",
          margin: "48px auto",
          padding: "24px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <h2 style={{ color: "#b34100", marginTop: 0 }}>
          The app could not sign you in
        </h2>
        <p>{authError}</p>
        <p>
          After fixing the server configuration, reload this page in the
          Shopify admin.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            border: "1px solid #b5b5b5",
            borderRadius: "6px",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <style>{SHELL_CSS}</style>
      <s-app-nav>
        {hasPlan && setupComplete && <s-link href="/app">Dashboard</s-link>}
        <s-link href="/app/plan">Plan</s-link>
        {hasPlan && <s-link href="/app/setup">Setup</s-link>}
        <s-link href="/app/help">Help</s-link>
      </s-app-nav>
      <NavLoadingShimmer target={pendingTarget} />
      <span className="psi-visually-hidden" role="status" aria-live="polite">
        {pendingTarget ? "Loading page…" : ""}
      </span>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
