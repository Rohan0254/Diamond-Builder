// Server-side Shopify billing + MongoDB persistence for Diamond Builder.
//
// The frontend never talks to Shopify or the database directly. This module is
// the single place that:
//   - creates recurring app subscriptions through Shopify's Admin GraphQL API
//   - cancels subscriptions
//   - reconciles the local MongoDB record with authoritative Shopify state
//
// All Shopify calls use the `admin` GraphQL client returned by
// `authenticate.admin`/`authenticate.webhook`, so the shop is always derived
// from an authenticated (verified) session and never from client input.

import prisma from "./db.server";
import {
  buildSubscriptionCreateVariables,
  isActiveStatus,
  isTerminalStatus,
  mapShopifySubscriptionStatus,
  mapShopifySubscriptionToRecord,
  parseSubscriptionCreateResponse,
  toAppSubscriptionGid,
  toDate,
} from "./lib/billing";
import { getPlan } from "./lib/plans";
import { getPlans } from "./plans.server";

/**
 * Minimum subset of the `AppSubscription` type we rely on. Mirrors the fragment
 * used internally by the Shopify libraries so it is safe across API versions.
 */
export const APP_SUBSCRIPTION_FIELDS = `#graphql
  fragment AppSubscriptionFields on AppSubscription {
    id
    name
    status
    test
    trialDays
    createdAt
    currentPeriodEnd
    lineItems {
      id
      plan {
        pricingDetails {
          ... on AppRecurringPricing {
            price {
              amount
              currencyCode
            }
            interval
          }
        }
      }
    }
  }
`;

const CURRENT_APP_INSTALLATION_QUERY = `${APP_SUBSCRIPTION_FIELDS}
  query CurrentAppInstallationActiveSubscriptions {
    currentAppInstallation {
      id
      activeSubscriptions {
        ...AppSubscriptionFields
      }
    }
  }
`;

const APP_SUBSCRIPTION_BY_ID_QUERY = `${APP_SUBSCRIPTION_FIELDS}
  query AppSubscriptionById($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        ...AppSubscriptionFields
      }
    }
  }
`;

const APP_SUBSCRIPTION_CREATE_MUTATION = `#graphql
  mutation SpeedScratcherAppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $trialDays: Int
    $replacementBehavior: AppSubscriptionReplacementBehavior
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      replacementBehavior: $replacementBehavior
      lineItems: $lineItems
    ) {
      appSubscription {
        id
        name
        status
        test
        trialDays
        createdAt
        currentPeriodEnd
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_SUBSCRIPTION_CANCEL_MUTATION = `#graphql
  mutation SpeedScratcherAppSubscriptionCancel($id: ID!, $prorate: Boolean) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      appSubscription {
        id
        name
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Shopify test charges are required for development/demo stores. Default to test
 * mode and require an explicit `BILLING_TEST_MODE=false` to charge for real.
 */
export function isTestBillingMode() {
  return process.env.BILLING_TEST_MODE !== "false";
}

async function graphqlJson(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  return response.json();
}

/** Fetches the shop's currently active app subscriptions from Shopify. */
export async function fetchActiveSubscriptions(admin) {
  const json = await graphqlJson(admin, CURRENT_APP_INSTALLATION_QUERY);
  if (json?.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join(", ") ||
        "Failed to load active subscriptions",
    );
  }
  return json?.data?.currentAppInstallation?.activeSubscriptions ?? [];
}

/** Fetches a single app subscription by its Shopify GID. */
export async function fetchSubscriptionById(admin, id) {
  if (!id) return null;
  const json = await graphqlJson(admin, APP_SUBSCRIPTION_BY_ID_QUERY, { id });
  if (json?.errors?.length) return null;
  const node = json?.data?.node ?? null;
  // `node` returns null when the id is not an AppSubscription.
  return node && node.id ? node : null;
}

/**
 * Creates a recurring subscription and returns the parsed result:
 * `{ ok, subscription, confirmationUrl, graphqlErrors, userErrors }`.
 */
export async function createShopifySubscription(
  admin,
  { plan, returnUrl, test, trialDays, replacementBehavior },
) {
  const variables = buildSubscriptionCreateVariables({
    plan,
    returnUrl,
    test,
    trialDays,
    replacementBehavior,
  });
  const json = await graphqlJson(
    admin,
    APP_SUBSCRIPTION_CREATE_MUTATION,
    variables,
  );
  return parseSubscriptionCreateResponse(json);
}

/** Cancels a subscription. Returns `{ ok, subscription, userErrors }`. */
export async function cancelShopifySubscription(
  admin,
  { subscriptionId, prorate = true },
) {
  if (!subscriptionId) {
    return {
      ok: false,
      subscription: null,
      userErrors: [{ field: null, message: "Missing subscription id." }],
    };
  }
  const json = await graphqlJson(admin, APP_SUBSCRIPTION_CANCEL_MUTATION, {
    id: subscriptionId,
    prorate: Boolean(prorate),
  });
  const graphqlErrors = (json?.errors ?? []).map((error) => error.message);
  const payload = json?.data?.appSubscriptionCancel ?? null;
  const userErrors = (payload?.userErrors ?? []).map((error) => ({
    field: error?.field ?? null,
    message: error?.message ?? "Unknown Shopify error",
  }));
  const errors = [...graphqlErrors, ...userErrors.map((error) => error.message)];
  return {
    ok: errors.length === 0,
    subscription: payload?.appSubscription ?? null,
    userErrors: [...userErrors, ...graphqlErrors.map((message) => ({ field: null, message }))],
  };
}

/** The most recent local subscription record for a shop. */
export async function getLocalSubscription(shop) {
  return prisma.appSubscription.findFirst({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

/** All local subscription records for a shop (newest first). */
export async function getLocalSubscriptions(shop) {
  return prisma.appSubscription.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

/** Whether the shop has any billing history at all (trial eligibility). */
export async function hasBillingHistory(shop) {
  const count = await prisma.appSubscription.count({ where: { shop } });
  return count > 0;
}

/**
 * Stores the just-created, not-yet-approved subscription as PENDING.
 * The subscription id is authoritative (it comes from Shopify's mutation
 * response), never from the client.
 */
export async function recordPendingSubscription({ shop, plan, subscription, test }) {
  const now = new Date();
  const existing = subscription?.id
    ? await prisma.appSubscription.findFirst({
        where: { shop, shopifySubscriptionId: subscription.id },
      })
    : null;

  const data = {
    shop,
    planKey: plan.key,
    planName: plan.name,
    price: plan.price,
    currency: plan.currency,
    billingInterval: plan.interval,
    trialDays: Number(subscription?.trialDays ?? plan.trialDays),
    status: mapShopifySubscriptionStatus(subscription?.status ?? "PENDING"),
    shopifySubscriptionId: subscription?.id ?? null,
    test: Boolean(test ?? subscription?.test),
    confirmationInitiatedAt: now,
  };

  if (existing) {
    return prisma.appSubscription.update({ where: { id: existing.id }, data });
  }

  // Supersede any older pending attempts so the newest one is authoritative.
  await prisma.appSubscription.updateMany({
    where: { shop, status: "PENDING" },
    data: { status: "EXPIRED", cancelledAt: now },
  });

  return prisma.appSubscription.create({ data });
}

/**
 * Reconciles the exact subscription Shopify redirected the merchant back with
 * after an approval. The billing `returnUrl` carries a numeric `charge_id`;
 * fetching it directly (instead of only listing `activeSubscriptions`) persists
 * the charge even when no PENDING row was created, when the local record points
 * at a different attempt, or before the `app_subscriptions/update` webhook has
 * been delivered.
 */
export async function syncSubscriptionFromChargeId(admin, shop, chargeId) {
  const gid = toAppSubscriptionGid(chargeId);
  if (!gid) return getLocalSubscription(shop);

  const subscription = await fetchSubscriptionById(admin, gid);
  if (!subscription?.id) {
    // The charge could not be read (stale/foreign id): fall back to the normal
    // reconciliation rather than leaving the merchant with no record.
    return syncShopSubscription(admin, shop);
  }

  const [local, plans] = await Promise.all([
    getLocalSubscription(shop),
    getPlans(),
  ]);

  return upsertSubscriptionFromShopify({
    shop,
    subscription,
    // Keep the tier we created the charge from when the price can't be matched.
    fallbackPlan: getPlan(local?.planKey, plans),
    plans,
  });
}

/**
 * Writes authoritative Shopify subscription data to MongoDB. Preserves the
 * original `activatedAt`/`cancelledAt` timestamps and expires any stale PENDING
 * record once a subscription becomes active.
 */
export async function upsertSubscriptionFromShopify({
  shop,
  subscription,
  fallbackPlan = null,
  plans,
}) {
  if (!subscription?.id) return null;
  const mapped = mapShopifySubscriptionToRecord({
    shop,
    subscription,
    fallbackPlan,
    plans,
  });
  const existing = await prisma.appSubscription.findFirst({
    where: { shop, shopifySubscriptionId: mapped.shopifySubscriptionId },
  });
  const now = new Date();

  const data = {
    ...mapped,
    activatedAt:
      mapped.status === "ACTIVE" ? existing?.activatedAt ?? now : existing?.activatedAt ?? null,
    cancelledAt:
      isTerminalStatus(mapped.status) && !existing?.cancelledAt
        ? now
        : existing?.cancelledAt ?? null,
  };

  const saved = existing
    ? await prisma.appSubscription.update({ where: { id: existing.id }, data })
    : await prisma.appSubscription.create({ data });

  if (isActiveStatus(mapped.status)) {
    await prisma.appSubscription.updateMany({
      where: {
        shop,
        status: "PENDING",
        shopifySubscriptionId: { not: mapped.shopifySubscriptionId },
      },
      data: { status: "EXPIRED", cancelledAt: now },
    });
  }

  return saved;
}

/** Marks a local record as cancelled after Shopify confirms the cancellation. */
export async function markSubscriptionCancelled(recordId) {
  if (!recordId) return null;
  return prisma.appSubscription.update({
    where: { id: recordId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

/**
 * Reconciles the local record with Shopify. Called when the merchant returns
 * from approval and whenever the pricing page loads, so the UI never relies on
 * the frontend redirect alone.
 */
export async function syncShopSubscription(admin, shop) {
  const local = await getLocalSubscription(shop);
  const [activeSubscriptions, plans] = await Promise.all([
    fetchActiveSubscriptions(admin),
    getPlans(),
  ]);

  if (activeSubscriptions.length > 0) {
    const matched =
      (local?.shopifySubscriptionId &&
        activeSubscriptions.find(
          (subscription) => subscription.id === local.shopifySubscriptionId,
        )) ||
      activeSubscriptions[0];
    // If this is the subscription we created, keep its known tier even after a
    // database price change moved it off the current plan price (otherwise it
    // would be re-mapped to a "custom" plan and lose its highlight).
    const fallbackPlan =
      local?.shopifySubscriptionId && matched?.id === local.shopifySubscriptionId
        ? getPlan(local.planKey, plans)
        : null;
    return upsertSubscriptionFromShopify({
      shop,
      subscription: matched,
      fallbackPlan,
      plans,
    });
  }

  if (local?.shopifySubscriptionId) {
    const fresh = await fetchSubscriptionById(admin, local.shopifySubscriptionId);
    if (fresh) {
      return upsertSubscriptionFromShopify({
        shop,
        subscription: fresh,
        fallbackPlan: getPlan(local.planKey, plans),
        plans,
      });
    }
    if (isActiveStatus(local.status)) {
      return prisma.appSubscription.update({
        where: { id: local.id },
        data: { status: "EXPIRED", cancelledAt: new Date() },
      });
    }
  }

  return local;
}

/**
 * Cheap reconciliation used by the app shell. Only touches Shopify when the
 * shop already has a local billing record, keeping ordinary page loads fast.
 */
export async function reconcileIfTracked(admin, shop) {
  const count = await prisma.appSubscription.count({ where: { shop } });
  if (count === 0) return null;
  return syncShopSubscription(admin, shop);
}

/** Serializable subscription view for the pricing UI (never leaks secrets). */
export function serializeSubscription(record) {
  if (!record) return null;
  const date = (value) => (value ? toDate(value)?.toISOString() ?? null : null);
  return {
    id: record.id,
    planKey: record.planKey,
    planName: record.planName,
    price: record.price,
    currency: record.currency,
    billingInterval: record.billingInterval,
    trialDays: record.trialDays,
    trialEndsAt: date(record.trialEndsAt),
    currentPeriodEnd: date(record.currentPeriodEnd),
    status: record.status,
    shopifySubscriptionId: record.shopifySubscriptionId,
    confirmationInitiatedAt: date(record.confirmationInitiatedAt),
    activatedAt: date(record.activatedAt),
    cancelledAt: date(record.cancelledAt),
    isActive: isActiveStatus(record.status),
    isPending: mapShopifySubscriptionStatus(record.status) === "PENDING",
    isTerminal: isTerminalStatus(record.status),
  };
}
