// Pure billing helpers shared by the server, the webhook handler and the tests.
//
// Everything in this module is deterministic and dependency free: it only
// transforms/validates data. The actual Shopify API and MongoDB calls live in
// `app/billing.server.js`. Keeping the decision logic here makes the tricky
// parts (billing errors, declined approvals, duplicate webhooks, trial
// eligibility) unit testable without touching the network or a database.

import {
  BILLING_INTERVAL,
  CURRENCY_CODE,
  PLANS,
  TRIAL_DAYS,
  findPlanByPrice,
} from "./plans.js";

/** Statuses the app understands locally. */
export const LOCAL_STATUSES = [
  "PENDING",
  "ACTIVE",
  "CANCELLED",
  "EXPIRED",
  "DECLINED",
  "FROZEN",
];

const ACTIVE_STATUSES = new Set(["ACTIVE", "ACCEPTED"]);
const TERMINAL_STATUSES = new Set(["CANCELLED", "EXPIRED", "DECLINED"]);

/** Coerces any value into a valid `Date`, or `null`. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Maps a Shopify `AppSubscriptionStatus` to the local status vocabulary.
 * Unknown statuses are preserved (upper cased) rather than silently discarded.
 */
export function mapShopifySubscriptionStatus(status) {
  if (typeof status !== "string" || status.trim() === "") return "PENDING";
  const normalized = status.trim().toUpperCase();
  if (ACTIVE_STATUSES.has(normalized)) return "ACTIVE";
  return normalized;
}

export function isActiveStatus(status) {
  return mapShopifySubscriptionStatus(status) === "ACTIVE";
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(mapShopifySubscriptionStatus(status));
}

/** Extracts human readable GraphQL (transport level) errors from a response. */
export function extractGraphqlErrors(json) {
  if (!json || !Array.isArray(json.errors)) return [];
  return json.errors.map((error) =>
    typeof error?.message === "string" ? error.message : String(error),
  );
}

/**
 * Parses the `appSubscriptionCreate` mutation response.
 *
 * Returns `{ ok: false }` for GraphQL errors, Shopify user errors (for example
 * "merchant declined") and for a missing confirmation URL. Never throws, so the
 * caller can always surface a friendly message.
 */
export function parseSubscriptionCreateResponse(json) {
  const graphqlErrors = extractGraphqlErrors(json);
  const payload = json?.data?.appSubscriptionCreate ?? null;
  const userErrors = (payload?.userErrors ?? []).map((error) => ({
    field: error?.field ?? null,
    message: error?.message ?? "Unknown Shopify error",
  }));

  if (graphqlErrors.length > 0 || userErrors.length > 0) {
    return {
      ok: false,
      subscription: payload?.appSubscription ?? null,
      confirmationUrl: null,
      graphqlErrors,
      userErrors,
    };
  }

  const confirmationUrl = payload?.confirmationUrl ?? null;
  const subscription = payload?.appSubscription ?? null;

  if (!confirmationUrl || !subscription?.id) {
    return {
      ok: false,
      subscription,
      confirmationUrl,
      graphqlErrors,
      userErrors: [
        {
          field: null,
          message: "Shopify did not return a subscription confirmation URL.",
        },
      ],
    };
  }

  return { ok: true, subscription, confirmationUrl, graphqlErrors, userErrors };
}

/** Builds the variables for the `appSubscriptionCreate` mutation. */
export function buildSubscriptionCreateVariables({
  plan,
  returnUrl,
  test,
  trialDays,
  replacementBehavior,
}) {
  const variables = {
    name: plan.name,
    returnUrl,
    test: Boolean(test),
    trialDays: Number.isFinite(trialDays) ? trialDays : plan.trialDays,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            interval: plan.interval,
            price: {
              amount: plan.price,
              currencyCode: plan.currency,
            },
          },
        },
      },
    ],
  };
  if (replacementBehavior) {
    variables.replacementBehavior = replacementBehavior;
  }
  return variables;
}

/**
 * Returns the Shopify admin base URL for the app on an embedded shop:
 * `https://admin.shopify.com/store/<shop>/apps/<apiKey>`.
 *
 * Falls back to `appUrl` (with any trailing slash removed) when the shop or API
 * key is missing.
 */
export function buildEmbeddedAppBase({ appUrl, apiKey, shop }) {
  const cleanShop = String(shop || "").replace(/\.myshopify\.com$/, "");
  if (cleanShop && apiKey) {
    return `https://admin.shopify.com/store/${cleanShop}/apps/${apiKey}`;
  }
  return String(appUrl || "").replace(/\/+$/, "");
}

/**
 * Builds the URL Shopify sends the merchant back to after they approve (or
 * decline) a subscription.
 *
 * For an **embedded** app this must point at the merchant's Shopify admin, not
 * at the app's own host. The admin re-opens the app in its iframe and hands it a
 * session token, so the normal embedded auth flow can complete. Returning to the
 * app host instead makes the top-level browser land on a document request with
 * no session token; the app then redirects to the auth *bounce*
 * (`/auth/session-token`) **in the top window**, where App Bridge has no host to
 * fetch a token from and can strand the merchant on a blank page. This is
 * especially visible on a fresh install (the first plan approval).
 *
 * The shape mirrors the default embedded return URL in `@shopify/shopify-api`
 * (`buildEmbeddedAppUrl`). Shopify appends its own `charge_id` to the result.
 *
 * @param {object} args
 * @param {string} args.appUrl  App base URL used only as a fallback.
 * @param {string} args.apiKey  Shopify API key (client id).
 * @param {string} args.shop    Shop domain (`*.myshopify.com`).
 * @param {string} [args.path]  App path to land on (default `/app/setup`).
 * @param {string} [args.host]  Embedded `host` param to preserve.
 */
export function buildEmbeddedReturnUrl({
  appUrl,
  apiKey,
  shop,
  path = "/app/setup",
  host,
}) {
  const base = buildEmbeddedAppBase({ appUrl, apiKey, shop });
  const returnUrl = new URL(`${base}${path}`);
  if (shop) returnUrl.searchParams.set("shop", shop);
  if (host && host.length < 256) {
    returnUrl.searchParams.set("host", host);
  }
  returnUrl.searchParams.set("embedded", "1");
  // Shopify appends its own `charge_id`; never carry a stale one forward.
  returnUrl.searchParams.delete("charge_id");
  const urlString = returnUrl.toString();
  // Fallback if somehow still too long - strip non-essential params
  if (urlString.length > 2000) {
    const fallback = new URL(`${base}${path}`);
    if (shop) fallback.searchParams.set("shop", shop);
    fallback.searchParams.set("embedded", "1");
    return fallback.toString();
  }
  return urlString;
}

/**
 * Shopify only allows a single trial per app subscription. New shops get the
 * plan's 14 day trial; a shop with prior billing history does not get another.
 */
export function computeTrialDays(hasPriorSubscription, planTrialDays = TRIAL_DAYS) {
  return hasPriorSubscription ? 0 : planTrialDays;
}

/** Pulls the recurring price/interval out of an `AppSubscription`. */
export function selectRecurringPricing(subscription) {
  const lineItems = subscription?.lineItems ?? [];
  for (const item of lineItems) {
    const details = item?.plan?.pricingDetails;
    if (details && typeof details === "object" && details.price && details.interval) {
      return {
        amount: Number(details.price.amount),
        currencyCode: details.price.currencyCode ?? CURRENCY_CODE,
        interval: details.interval,
      };
    }
  }
  return null;
}

/**
 * Calculates the trial end date from Shopify's authoritative created-at and
 * trial-days values. Never derives dates from the local button click.
 */
export function computeTrialEndsAt(createdAt, trialDays) {
  const start = toDate(createdAt);
  const days = Number(trialDays);
  if (!start || !Number.isFinite(days) || days <= 0) return null;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

/**
 * Maps an authoritative Shopify `AppSubscription` onto the local record shape.
 * Falls back to a locally known plan when the price cannot be matched.
 */
export function mapShopifySubscriptionToRecord({
  shop,
  subscription,
  fallbackPlan = null,
  plans = PLANS,
}) {
  const pricing = selectRecurringPricing(subscription);
  const plan =
    (pricing && findPlanByPrice(pricing.amount, pricing.currencyCode, plans)) ||
    fallbackPlan ||
    null;
  const status = mapShopifySubscriptionStatus(subscription?.status);
  const createdAt = toDate(subscription?.createdAt);
  const trialDays = Number.isFinite(Number(subscription?.trialDays))
    ? Number(subscription.trialDays)
    : plan?.trialDays ?? TRIAL_DAYS;

  return {
    shop,
    planKey: plan?.key ?? "custom",
    planName: plan?.name ?? subscription?.name ?? "Custom plan",
    price: pricing ? pricing.amount : plan?.price ?? 0,
    currency: pricing?.currencyCode ?? plan?.currency ?? CURRENCY_CODE,
    billingInterval: pricing?.interval ?? plan?.interval ?? BILLING_INTERVAL,
    trialDays,
    trialEndsAt: computeTrialEndsAt(createdAt, trialDays),
    currentPeriodEnd: toDate(subscription?.currentPeriodEnd),
    status,
    shopifySubscriptionId: subscription?.id ?? null,
    test: Boolean(subscription?.test),
  };
}

/**
 * Normalizes the `charge_id` Shopify appends to a billing `returnUrl` into an
 * `AppSubscription` GID. Shopify sends the numeric id (for example
 * `88502403153`); a full `gid://` value is accepted unchanged so the result is
 * always safe to pass straight to the `node(id:)` query.
 */
export function toAppSubscriptionGid(chargeId) {
  if (chargeId === null || chargeId === undefined) return null;
  const value = String(chargeId).trim();
  if (!value) return null;
  return value.startsWith("gid://")
    ? value
    : `gid://shopify/AppSubscription/${value}`;
}

/** Reads the subscription id from an `app_subscriptions/update` payload. */
export function parseWebhookSubscriptionId(payload) {
  const subscription =
    payload?.app_subscription ?? payload?.appSubscription ?? null;
  return subscription?.admin_graphql_api_id ?? subscription?.id ?? null;
}

/** Reads the status from an `app_subscriptions/update` payload. */
export function parseWebhookStatus(payload) {
  const subscription =
    payload?.app_subscription ?? payload?.appSubscription ?? null;
  return subscription?.status ?? null;
}

/**
 * Returns the most recent PENDING record created within `windowMs`, if any.
 * Used to prevent duplicate pending subscriptions from rapid double clicks.
 */
export function isDuplicatePending(
  records,
  { now = Date.now(), windowMs = 2 * 60 * 1000 } = {},
) {
  if (!Array.isArray(records)) return null;
  const threshold = new Date(now - windowMs);
  const recent = records
    .filter((record) => mapShopifySubscriptionStatus(record?.status) === "PENDING")
    .map((record) => ({
      record,
      at: toDate(record?.confirmationInitiatedAt) ?? toDate(record?.createdAt),
    }))
    .filter((entry) => entry.at && entry.at.getTime() >= threshold.getTime())
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return recent[0]?.record ?? null;
}

/**
 * Decides what to do with an incoming webhook event.
 *
 * - `create` when there is no local record yet (we still persist it)
 * - `ignore` when the event refers to a different subscription than the one we
 *   track, or is missing an id
 * - `noop` for duplicate deliveries (status already matches)
 * - `apply` when the status actually changed
 */
export function resolveWebhookAction({ local, incoming }) {
  if (!incoming?.id) {
    return { action: "ignore", reason: "missing-subscription-id" };
  }
  if (!local) {
    return { action: "create", reason: "no-local-record" };
  }
  if (
    local.shopifySubscriptionId &&
    local.shopifySubscriptionId !== incoming.id
  ) {
    return { action: "ignore", reason: "subscription-mismatch" };
  }
  const incomingStatus = mapShopifySubscriptionStatus(incoming.status);
  if (mapShopifySubscriptionStatus(local.status) === incomingStatus) {
    return { action: "noop", reason: "duplicate-event" };
  }
  return { action: "apply", reason: "status-change" };
}

/** The plan that should be highlighted as "popular" in the UI (Pro). */
export function getPopularPlan(plans = PLANS) {
  return plans.find((plan) => plan.popular) ?? null;
}
