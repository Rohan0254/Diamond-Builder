import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdminOrDiagnose } from "../shopify.server";
/* eslint-disable react/prop-types -- plain JS internal components, not a public API */
import {
  cancelShopifySubscription,
  createShopifySubscription,
  fetchActiveSubscriptions,
  getLocalSubscription,
  getLocalSubscriptions,
  isTestBillingMode,
  markSubscriptionCancelled,
  recordPendingSubscription,
  serializeSubscription,
  syncShopSubscription,
  syncSubscriptionFromChargeId,
} from "../billing.server";
import {
  COMPARISON_ROWS,
  withBillingCycle,
  TRIAL_ROW_LABEL,
  findPlanByPrice,
  formatPrice,
  getPlan,
} from "../lib/plans";
import { getPlans, getPublicPlanList } from "../plans.server";
import { getLatestSetupVerification } from "../setup.server";
import {
  buildEmbeddedReturnUrl,
  computeTrialDays,
  isActiveStatus,
  isDuplicatePending,
  selectRecurringPricing,
} from "../lib/billing";

/** How long a PENDING subscription blocks another attempt. */
const PENDING_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

/**
 * React Router v7 removed the `json` helper, so loaders/actions must return
 * an explicit Response. This is a drop-in replacement for the old helper.
 */
function json(data, init = {}) {
  const { status, headers, ...rest } = init ?? {};
  return new Response(JSON.stringify(data), {
    ...rest,
    status: status ?? 200,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

export const loader = async ({ request }) => {
  // Prices live in the `Plan` collection (see app/plans.server.js): editing a row
  // in the database changes this page on the next load.
  const plans = await getPublicPlanList();
  const auth = await authenticateAdminOrDiagnose(request, "plan.loader");

  // Auth failures (e.g. rejected token exchange, session DB errors) come back
  // as readable data instead of a sanitized 500, so the page can show them.
  if (!auth.ok) {
    return json({
      plans,
      subscription: null,
      loadError: null,
      authError: auth.error,
      shop: null,
      testMode: isTestBillingMode(),
    });
  }

  const { admin, session } = auth.context;

  let subscription = null;
  let loadError = null;

  try {
    // Returning from Shopify's approval page carries a `charge_id`; persist that
    // exact charge so the plan is recognised immediately. Otherwise reconcile
    // normally. Both are no-ops for shops with no billing history.
    const chargeId = new URL(request.url).searchParams.get("charge_id");
    const record = chargeId
      ? await syncSubscriptionFromChargeId(admin, session.shop, chargeId)
      : await syncShopSubscription(admin, session.shop);
    subscription = serializeSubscription(record);
  } catch (error) {
    console.error("Failed to sync subscription from Shopify", error);
    loadError =
      "We couldn't verify your subscription with Shopify right now. Showing your last known state.";
    try {
      const local = await getLocalSubscription(session.shop);
      subscription = serializeSubscription(local);
    } catch (dbError) {
      console.error("Failed to load local subscription", dbError);
    }
  }

  return json({
    plans,
    subscription,
    loadError,
    authError: null,
    shop: session.shop,
    testMode: isTestBillingMode(),
  });
};

/**
 * Builds the URL Shopify returns the merchant to after approval.
 *
 * For an embedded app this is the Shopify **admin** URL
 * (`https://admin.shopify.com/store/<shop>/apps/<apiKey>/app/setup`), not the
 * app's own host. See `buildEmbeddedReturnUrl` in `app/lib/billing.js` for why:
 * returning to the app host makes the post-approval top-window load fall into
 * the embedded auth bounce, which can strand the merchant on a blank page (it is
 * reproducible on the first install / first plan approval).
 */
function buildReturnUrl(request, shop, extraSearch = "", path = "/app/setup") {
  const requestUrl = new URL(request.url);
  // `host` may only be present on the original iframe URL, so merge both the
  // server request and the client-supplied search (a fetcher POST can drop it).
  // Only preserve essential embedded params to keep the return URL short.
  const search = new URLSearchParams(
    [requestUrl.search.replace(/^\?/, ""), extraSearch.replace(/^\?/, "")]
      .filter(Boolean)
      .join("&"),
  );
  const host = search.get("host");
  const shopParam = shop || search.get("shop");
  return buildEmbeddedReturnUrl({
    // eslint-disable-next-line no-undef
    appUrl: process.env.SHOPIFY_APP_URL || requestUrl.origin,
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: shopParam,
    host,
    path,
  });
}

/** Resolves the plan key of the shop's current active subscription. */
async function resolveActivePlanKey(admin, shop, localSubscriptions, plans) {
  const activeLocal = localSubscriptions.find((record) =>
    isActiveStatus(record.status),
  );
  if (activeLocal) return activeLocal.planKey;

  const activeShopify = await fetchActiveSubscriptions(admin);
  const current = activeShopify[0];
  if (!current) return null;

  const pricing = selectRecurringPricing(current);
  const matched =
    pricing && findPlanByPrice(pricing.amount, pricing.currencyCode, plans);
  return matched?.key ?? null;
}

async function handleSelect({ form, request, admin, session }) {
  // `form` is parsed once by the action: a Request body can only be read once,
  // so re-reading `request.formData()` here threw "Body is unusable" and the
  // Shopify error boundary rendered it as a 500 ("Application error").
  const planKey = String(form.get("planKey") ?? "");
  const force = String(form.get("retry") ?? "") === "1";
  // Live plans from the `Plan` collection — the price charged is whatever the
  // database row says, never anything the browser sent.
  const plans = await getPlans();
  const basePlan = getPlan(planKey, plans);
  const cycle = String(form.get("cycle") ?? "monthly");
  if (!["monthly", "yearly"].includes(cycle)) return json({ok:false,error:"Invalid billing cycle."},{status:400});
  let plan;
  try { plan = basePlan ? withBillingCycle(basePlan, cycle) : null; } catch { return json({ok:false,error:"Annual billing is unavailable."},{status:400}); }

  // Never trust the price/plan from the browser: validate against the server
  // config, and never let a merchant start a plan that has been deactivated.
  if (!plan || plan.active === false) {
    return json({ ok: false, error: "That plan is not available." }, { status: 400 });
  }

  const shop = session.shop;
  let localSubscriptions;
  try {
    localSubscriptions = await getLocalSubscriptions(shop);
  } catch (error) {
    console.error("Failed to load local subscriptions", error);
    return json(
      {
        ok: false,
        error:
          "We couldn't read your billing state right now. Please try again in a moment.",
      },
      { status: 502 },
    );
  }

  let activePlanKey;
  try {
    activePlanKey = await resolveActivePlanKey(admin, shop, localSubscriptions, plans);
  } catch (error) {
    console.error("Failed to check active subscription", error);
    return json(
      {
        ok: false,
        error:
          "We couldn't reach Shopify to check your current subscription. Please try again.",
      },
      { status: 502 },
    );
  }

  if (activePlanKey === plan.key && localSubscriptions.some((record) => isActiveStatus(record.status) && record.planKey === plan.key && record.billingInterval === plan.interval)) {
    return json(
      { ok: false, error: `You're already subscribed to the ${plan.name} plan.` },
      { status: 409 },
    );
  }

  if (!force) {
    const duplicate = isDuplicatePending(localSubscriptions, {
      windowMs: PENDING_DEDUPE_WINDOW_MS,
    });
    if (duplicate) {
      return json(
        {
          ok: false,
          pending: true,
          error:
            "You already have a subscription waiting for approval in Shopify. Finish that approval, or retry to start a new one.",
        },
        { status: 409 },
      );
    }
  }

  if (plan.price === 0) {
    try {
      const active = await fetchActiveSubscriptions(admin);
      for (const subscription of active) {
        const result = await cancelShopifySubscription(admin, {subscriptionId: subscription.id, prorate:true});
        if (!result.ok) return json({ok:false,error:result.userErrors[0]?.message ?? "Could not cancel the paid plan."},{status:502});
        const record = localSubscriptions.find((item) => item.shopifySubscriptionId === subscription.id);
        if (record) await markSubscriptionCancelled(record.id);
      }
      return json({ok:true,message:"Free plan selected."});
    } catch { return json({ok:false,error:"Could not switch to Free. Please retry."},{status:502}); }
  }

  const hasBillingHistory =
    localSubscriptions.length > 0 || (await hasActiveShopify(admin));
  const isPlanChange = Boolean(activePlanKey);
  const trialDays = computeTrialDays(hasBillingHistory, plan.trialDays);

  // Where Shopify sends the merchant after approval. A first-time activation
  // goes to the one-time Setup step; a shop that already completed Setup (for
  // example a later plan change) goes back to the Plan page. The destination is
  // baked into the return URL so no extra redirect is needed when the embedded
  // app reloads.
  let setupComplete = false;
  try {
    const record = await getLatestSetupVerification(session.shop);
    setupComplete = record?.overallStatus === "complete";
  } catch (error) {
    console.error("Failed to read setup status", error);
  }

  let result;
  try {
    result = await createShopifySubscription(admin, {
      plan,
      returnUrl: buildReturnUrl(
        request,
        session.shop,
        String(form.get("returnSearch") ?? ""),
        setupComplete ? "/app/plan" : "/app/setup",
      ),
      test: isTestBillingMode(),
      trialDays,
      replacementBehavior: isPlanChange ? "APPLY_IMMEDIATELY" : undefined,
    });
  } catch (error) {
    console.error("Failed to create Shopify subscription", error);
    return json(
      {
        ok: false,
        error:
          "Shopify could not start the subscription. No charge was made. Please try again.",
      },
      { status: 502 },
    );
  }

  if (!result.ok) {
    const message =
      result.userErrors[0]?.message ||
      result.graphqlErrors[0] ||
      "Shopify could not start the subscription.";
    return json({ ok: false, error: message }, { status: 502 });
  }

  try {
    await recordPendingSubscription({
      shop,
      plan,
      subscription: result.subscription,
      test: isTestBillingMode(),
    });
  } catch (error) {
    // The Shopify subscription already exists; failing to persist must not
    // block the merchant from approving it. The webhook/reconciliation will
    // repair the local record afterwards.
    console.error("Failed to persist pending subscription", error);
  }

  // Return the hosted confirmation URL to the client. The store returns the
  // URL as JSON because fetcher/navigation submissions and single-fetch mode
  // make server redirects/401s unreliable; the client navigates the top window
  // to Shopify's checkpoint page with it.
  return json({ ok: true, confirmationUrl: result.confirmationUrl, shop });
}

async function hasActiveShopify(admin) {
  try {
    const active = await fetchActiveSubscriptions(admin);
    return active.length > 0;
  } catch {
    return false;
  }
}

async function handleCancel({ admin, session }) {
  const shop = session.shop;
  let record;
  try {
    record = await getLocalSubscription(shop);
  } catch (error) {
    console.error("Failed to load local subscription", error);
    return json(
      { ok: false, error: "We couldn't read your billing state. Please try again." },
      { status: 502 },
    );
  }

  if (!record || !isActiveStatus(record.status) || !record.shopifySubscriptionId) {
    return json(
      { ok: false, error: "There is no active subscription to cancel." },
      { status: 409 },
    );
  }

  let result;
  try {
    result = await cancelShopifySubscription(admin, {
      subscriptionId: record.shopifySubscriptionId,
      prorate: true,
    });
  } catch (error) {
    console.error("Failed to cancel subscription", error);
    return json(
      {
        ok: false,
        error: "Shopify could not cancel the subscription. Please try again.",
      },
      { status: 502 },
    );
  }

  if (!result.ok) {
    return json(
      {
        ok: false,
        error:
          result.userErrors[0]?.message ||
          "Shopify could not cancel the subscription.",
      },
      { status: 502 },
    );
  }

  try {
    await markSubscriptionCancelled(record.id);
  } catch (error) {
    // Shopify already cancelled; a failed local write is repaired by the next
    // reconciliation, so don't fail the request over it.
    console.error("Failed to update local record after cancel", error);
  }
  return json({ ok: true, message: "Your subscription has been cancelled." });
}

export const action = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "plan.action");

  // If authentication fails, return a readable message rather than letting a
  // bare 500 Response turn into "Unexpected Server Error". Status 200 keeps it
  // flowing to the fetcher's data, where the page already renders a toast.
  if (!auth.ok) {
    return json({ ok: false, error: auth.error });
  }

  const { admin, session } = auth.context;

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("[plan.action] could not read form data", error);
    return json(
      { ok: false, error: "That request could not be read. Please try again." },
      { status: 400 },
    );
  }
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "select":
      return handleSelect({ form, request, admin, session });
    case "cancel":
      return handleCancel({ admin, session });
    default:
      return json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }
};

/** @returns {{label: string, disabled: boolean, variant: "primary" | "secondary"}} */
function planActionState(plan, subscription) {
  if (plan.price === 0) return {label:subscription?.isActive ? "Switch to Free" : "Current plan", disabled:!subscription?.isActive, variant:"secondary"};
  if (!subscription) {
    return {
      label: "Start 14-day free trial",
      disabled: false,
      variant: plan.popular ? "primary" : "secondary",
    };
  }
  if (subscription.isActive) {
    if (subscription.planKey === plan.key && subscription.billingInterval === plan.interval) {
      return { label: "Your current plan", disabled: true, variant: "secondary" };
    }
    return {
      label: `Switch to ${plan.name}`,
      disabled: false,
      variant: plan.popular ? "primary" : "secondary",
    };
  }
  if (subscription.isPending) {
    if (subscription.planKey === plan.key && subscription.billingInterval === plan.interval) {
      return { label: "Awaiting approval", disabled: true, variant: "secondary" };
    }
    return { label: "Pending approval", disabled: true, variant: "secondary" };
  }
  return {
    label: "Start 14-day free trial",
    disabled: false,
    variant: plan.popular ? "primary" : "secondary",
  };
}

function PlanCard({ plan, subscription, busy, onSelect, onCancel }) {
  const action = planActionState(plan, subscription);
  const isCurrent = subscription?.planKey === plan.key && subscription.billingInterval === plan.interval;
  const showPopular = plan.popular;
  const showCurrent = Boolean(subscription?.isActive && isCurrent);
  const showAwaiting = Boolean(subscription?.isPending && isCurrent);
  const [confirmCancelCard, setConfirmCancelCard] = useState(false);

  return (
    <div
      className={`ss-plan-card${plan.popular ? " ss-plan-card--popular" : ""}`}
    >
      <div className="ss-plan-card__inner">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-heading>{plan.name}</s-heading>
            {showPopular && <s-badge tone="success">Most Popular</s-badge>}
            {showCurrent && <s-badge tone="success">Current plan</s-badge>}
            {showAwaiting && <s-badge tone="info">Awaiting approval</s-badge>}
          </s-stack>

          <div>
            <span className="ss-plan-price">{plan.price === 0 ? "Free" : formatPrice(plan)}</span>
            {plan.price > 0 && <span className="ss-plan-price__suffix">/{plan.interval === "ANNUAL" ? "year" : "month"}</span>}
            {plan.price > 0 && plan.interval !== "ANNUAL" && <p>or {formatPrice({...plan, price:plan.annualPrice})}/year · save 17%</p>}
          </div>

          <s-text color="subdued">{plan.description}</s-text>

          <s-divider />

          <s-unordered-list>
            {plan.features.map((feature) => (
              <s-list-item key={feature}>{feature}</s-list-item>
            ))}
          </s-unordered-list>

          {showCurrent ? (
            <s-button
              tone="critical"
              variant="secondary"
              disabled={busy}
              loading={busy}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmCancelCard(true);
              }}
              accessibilityLabel={`Cancel plan - ${plan.name}`}
            >
              Cancel plan
            </s-button>
          ) : (
            <s-button
              variant={action.variant}
              disabled={action.disabled || busy}
              loading={busy}
              onClick={() => onSelect(plan.key)}
              accessibilityLabel={`${action.label} - ${plan.name}`}
            >
              {action.label}
            </s-button>
          )}
        </s-stack>
      </div>
      <CancelSubscriptionModal
        open={confirmCancelCard}
        busy={busy}
        onClose={() => {
          setConfirmCancelCard(false);
        }}
        onConfirm={() => {
          setConfirmCancelCard(false);
          onCancel && onCancel();
        }}
      />
    </div>
  );
}

function ComparePlans({ plans }) {
  return (
    <s-section heading="Compare plans">
      <div className="ss-compare-scroll">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Feature</s-table-header>
            {plans.map((plan) => (
              <s-table-header key={plan.key}>{plan.name}</s-table-header>
            ))}
          </s-table-header-row>
          <s-table-body>
            {COMPARISON_ROWS.map((row) => (
              <s-table-row key={row.key}>
                <s-table-cell>{row.label}</s-table-cell>
                {plans.map((plan) => (
                  <s-table-cell key={plan.key}>
                    {(row.key === "advancedCss" ? plan.interval === "ANNUAL" && plan.entitlements[row.key] : plan.entitlements[row.key]) ? (
                      <s-text tone="success" fontWeight="semibold">
                        ✓
                      </s-text>
                    ) : (
                      <s-text color="subdued">—</s-text>
                    )}
                  </s-table-cell>
                ))}
              </s-table-row>
            ))}
            <s-table-row>
              <s-table-cell>{TRIAL_ROW_LABEL}</s-table-cell>
              {plans.map((plan) => (
                <s-table-cell key={plan.key}>
                  <s-text tone="success">{plan.price === 0 ? "Free forever" : plan.trialDays + "-day free trial"}</s-text>
                </s-table-cell>
              ))}
            </s-table-row>
          </s-table-body>
        </s-table>
      </div>
    </s-section>
  );
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CurrentSubscription({ subscription, busy, onCancel, onRetry }) {
  if (!subscription || (!subscription.isActive && !subscription.isPending)) {
    return null;
  }

  const trialEnds = formatDate(subscription.trialEndsAt);
  const periodEnd = formatDate(subscription.currentPeriodEnd);

  return (
    <s-section heading="Your subscription">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text fontWeight="semibold">{subscription.planName}</s-text>
          <s-badge tone={subscription.isActive ? "success" : "info"}>
            {subscription.isActive ? "Active" : "Awaiting approval"}
          </s-badge>
        </s-stack>

        <s-text color="subdued">
          {formatPrice(subscription)} / {subscription.billingInterval === "ANNUAL" ? "year" : "month"} · billed{" "}
          {subscription.billingInterval === "ANNUAL" ? "annually" : "monthly"}
        </s-text>

        {subscription.isActive && trialEnds && (
          <s-text color="subdued">
            Free trial ends {trialEnds}
            {periodEnd ? ` · next charge ${periodEnd}` : ""}
          </s-text>
        )}

        {subscription.isPending && (
          <s-stack direction="block" gap="base">
            <s-text color="subdued">
              Shopify is waiting for you to approve this subscription. Complete
              the approval on Shopify&apos;s page to activate your plan.
            </s-text>
            <s-stack direction="inline">
              <s-button
                variant="primary"
                disabled={busy}
                loading={busy}
                onClick={onRetry}
              >
                Continue approval
              </s-button>
            </s-stack>
          </s-stack>
        )}

        {subscription.isActive && (
          <s-stack direction="inline" gap="small">
            <s-button
              tone="critical"
              variant="secondary"
              disabled={busy}
              loading={busy}
              onClick={onCancel}
            >
              Cancel plan
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}

/**
 * Confirmation dialog shown before a subscription is cancelled. Uses the Polaris
 * `<s-modal>` web component, driven imperatively so it works without App Bridge
 * React wrappers.
 */
function CancelSubscriptionModal({ open, busy, onClose, onConfirm }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    if (open) {
      if (typeof modal.showOverlay === "function") {
        modal.showOverlay();
      } else if (typeof modal.open === "function") {
        modal.open();
      } else if (typeof modal.setAttribute === "function") {
        modal.setAttribute('open', '');
      }
      // Force open
      if (typeof modal.open === "function" && modal.hasAttribute && !modal.hasAttribute('open')) {
        try { modal.open(); } catch { /* The overlay may already be open. */ }
      }
    } else {
      hideOverlaySafe(modal);
      if (typeof modal.close === "function") {
        modal.close();
      } else if (typeof modal.removeAttribute === "function") {
        modal.removeAttribute('open');
      }
    }
  }, [open]);

  // Handle close events from buttons only
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    
    const handleClose = (e) => {
      // Only close if triggered by explicit close/cancel, not overlay click
      if (e.type === 'close' || e.type === 'cancel') {
        onClose();
      }
    };
    
    modal.addEventListener('close', handleClose);
    modal.addEventListener('cancel', handleClose);
    return () => {
      modal.removeEventListener('close', handleClose);
      modal.removeEventListener('cancel', handleClose);
    };
  }, [onClose]);

  return (
    <s-modal
      ref={modalRef}
      id="cancel-subscription-modal"
      heading="Cancel subscription?"
    >
      <s-stack direction="block" gap="base">
        <s-text>
          Your plan stays active until the end of the current billing period, then
          it won&apos;t renew. You can subscribe again at any time.
        </s-text>
        <s-stack direction="inline" gap="base">
          <s-button variant="secondary" disabled={busy} onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}>
            Keep subscription
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            disabled={busy}
            loading={busy}
            onClick={onConfirm}
          >
            Yes, cancel
          </s-button>
        </s-stack>
      </s-stack>
    </s-modal>
  );
}

function hideOverlaySafe(element) {
  if (element && typeof element.hideOverlay === "function") {
    element.hideOverlay();
  }
}

export default function PlanPage() {
  const { plans: catalogPlans, subscription, loadError, authError, testMode } = useLoaderData();
  const [cycle, setCycle] = useState(() => subscription?.billingInterval === "ANNUAL" ? "yearly" : "monthly");
  const plans = catalogPlans.map((plan) => withBillingCycle(plan, cycle));
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const lastConfirmationUrl = useRef(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const submitting = fetcher.state !== "idle";

  useEffect(() => {
    shopify.loading(submitting);
  }, [shopify, submitting]);

  useEffect(() => {
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data?.ok && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  // The action returns Shopify's hosted confirmation URL as JSON (a fetcher
  // swallows redirects), so the client opens it. It MUST open in the TOP window:
  // the embedded iframe is refused by Shopify's checkout ("refused to connect").
  // `window.open(url, "_top")` is exactly what Shopify's own App Bridge redirect
  // helper emits; `window.top.location.assign(...)` instead throws a cross-origin
  // SecurityError, and the old fallback navigated our own iframe. The guarded
  // `lastConfirmationUrl` ref stops duplicate navigations on re-renders.
  useEffect(() => {
    const url = fetcher.data?.ok ? fetcher.data.confirmationUrl : null;
    if (!url || lastConfirmationUrl.current === url) return;
    lastConfirmationUrl.current = url;
    const opened = window.open(url, "_top");
    if (!opened) {
      try {
        window.top.location.href = url;
      } catch {
        window.location.href = url;
      }
    }
  }, [fetcher.data]);

  const selectPlan = (planKey, retry = false) => {
    fetcher.submit(
      {
        intent: "select",
        planKey,
        cycle: retry ? (subscription?.billingInterval === "ANNUAL" ? "yearly" : "monthly") : cycle,
        ...(retry ? { retry: "1" } : {}),
        // Keep the embedded params (shop/host) so the post-approval return URL
        // can re-open the app inside the same Shopify admin.
        returnSearch: (() => {
          if (typeof window === "undefined") return "";
          const params = new URLSearchParams(window.location.search);
          const filtered = new URLSearchParams();
          if (params.has("host")) {
            const hostVal = params.get("host");
            if (hostVal && hostVal.length < 256) filtered.set("host", hostVal);
          }
          return filtered.toString() ? `?${filtered.toString()}` : "";
        })(),
      },
      { method: "POST" },
    );
  };

  const cancelSubscription = () => {
    setConfirmCancel(false);
    fetcher.submit({ intent: "cancel" }, { method: "POST" });
  };

  // Re-issues `appSubscriptionCreate` (force) for the pending plan so Shopify
  // returns a fresh confirmation URL, which reopens the approval page. Without
  // this a pending record that was never approved would leave every plan button
  // disabled with no way to finish.
  const retryApproval = () => {
    if (subscription?.planKey) selectPlan(subscription.planKey, true);
  };

  return (
    <s-page heading="Choose the Right Plan for Your Store">
      <style>{`
        .ss-billing-switch { display:flex; gap:4px; width:fit-content; padding:4px; background:#f1f2f3; border-radius:10px; }
        .ss-billing-switch button { border:0; border-radius:7px; padding:10px 16px; background:transparent; cursor:pointer; font:inherit; }
        .ss-billing-switch button[aria-pressed="true"] { background:#fff; box-shadow:0 1px 4px #0002; font-weight:600; }
        .ss-billing-switch span { color:#008060; font-size:12px; }
        .ss-plan-card {
          background: #ffffff;
          border: 1px solid var(--p-color-border-subdued, #e1e3e5);
          border-radius: 16px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          height: 100%;
          transition: box-shadow 0.2s ease;
        }
        .ss-plan-card:hover {
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
        }
        .ss-plan-card--popular {
          border: 2px solid #008060;
          box-shadow: 0 6px 20px rgba(0, 128, 96, 0.12);
        }
        .ss-plan-card__inner {
          box-sizing: border-box;
          padding: 20px;
          height: 100%;
        }
        .ss-plan-price {
          font-size: 32px;
          font-weight: 650;
          letter-spacing: -0.5px;
        }
        .ss-plan-price__suffix {
          margin-inline-start: 4px;
          font-size: 14px;
          color: var(--p-color-text-subdued, #6d7175);
        }
        .ss-compare-scroll {
          max-width: 100%;
          overflow-x: auto;
        }
      `}</style>

      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small">
          <s-text color="subdued">
            Choose the diamond builder plan that fits your business.
          </s-text>
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone="success">Free plan available · 14-day trial on paid plans</s-badge>
            {testMode && <s-badge tone="warning">Test mode</s-badge>}
          </s-stack>
        </s-stack>

        {authError && (
          <s-banner tone="critical" heading="Could not authenticate with Shopify">
            <s-stack direction="block" gap="base">
              <s-text>{authError}</s-text>
              <s-stack direction="inline">
                <s-button onClick={() => window.location.reload()}>
                  Reload
                </s-button>
              </s-stack>
            </s-stack>
          </s-banner>
        )}

        {loadError && (
          <s-banner tone="warning" heading="Could not refresh subscription">
            {loadError}
          </s-banner>
        )}

        {fetcher.data?.pending && (
          <s-banner tone="info" heading="Approval pending">
            <s-stack direction="block" gap="base">
              <s-text>
                You already have a subscription waiting for approval in Shopify.
                Complete that approval, or start a new one.
              </s-text>
              <s-stack direction="inline">
                <s-button
                  onClick={() =>
                    selectPlan(subscription?.planKey ?? plans[0]?.key, true)
                  }
                >
                  Retry
                </s-button>
              </s-stack>
            </s-stack>
          </s-banner>
        )}

        <CurrentSubscription
          subscription={subscription}
          busy={submitting}
          onCancel={() => setConfirmCancel(true)}
          onRetry={retryApproval}
        />

        <div className="ss-billing-switch" role="group" aria-label="Billing cycle">
          <button type="button" aria-pressed={cycle === "monthly"} onClick={() => setCycle("monthly")}>Monthly</button>
          <button type="button" aria-pressed={cycle === "yearly"} onClick={() => setCycle("yearly")}>Yearly <span>Save 17%</span></button>
        </div>
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
          gap="base"
        >
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              subscription={subscription}
              busy={submitting}
              onSelect={selectPlan}
              onCancel={() => setConfirmCancel(true)}
            />
          ))}
        </s-grid>

        <ComparePlans plans={plans} />

        <s-text color="subdued">
          Prices are in USD. Paid plans include a 14-day free trial, and billing
          is handled securely by Shopify. Your trial only starts once Shopify
          confirms the subscription.
        </s-text>

        <CancelSubscriptionModal
          open={confirmCancel}
          busy={submitting}
          onClose={() => setConfirmCancel(false)}
          onConfirm={cancelSubscription}
        />
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
