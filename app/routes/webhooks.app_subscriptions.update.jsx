import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  fetchSubscriptionById,
  upsertSubscriptionFromShopify,
} from "../billing.server";
import {
  mapShopifySubscriptionStatus,
  parseWebhookStatus,
  parseWebhookSubscriptionId,
  resolveWebhookAction,
} from "../lib/billing";
import { getPlan } from "../lib/plans";
import { getPlans } from "../plans.server";

/**
 * Handles the `app_subscriptions/update` webhook.
 *
 * Webhooks can be delivered more than once and out of order, so processing is
 * idempotent: duplicate deliveries are detected (status already matches) and
 * events for a subscription we do not track are ignored. Whenever possible the
 * local record is refreshed from authoritative Shopify data instead of trusting
 * the webhook body.
 */
export const action = async ({ request }) => {
  const { payload, shop, topic, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const subscriptionId = parseWebhookSubscriptionId(payload);
  const webhookStatus = parseWebhookStatus(payload);

  if (!subscriptionId) {
    // Nothing we can act on - acknowledge so Shopify does not retry forever.
    return new Response();
  }

  let subscription = null;
  if (admin) {
    try {
      subscription = await fetchSubscriptionById(admin, subscriptionId);
    } catch (error) {
      console.error("Failed to load subscription for webhook", error);
    }
  }

  const local = await prisma.appSubscription.findFirst({
    where: { shop, shopifySubscriptionId: subscriptionId },
  });

  const incoming = {
    id: subscriptionId,
    status: subscription?.status ?? webhookStatus,
  };

  const decision = resolveWebhookAction({ local, incoming });
  if (decision.action === "ignore" || decision.action === "noop") {
    console.log(`Ignoring ${topic} event (${decision.reason}) for ${shop}`);
    return new Response();
  }

  if (subscription) {
    // Match the authoritative Shopify price against the live (database) plans.
    const plans = await getPlans();
    await upsertSubscriptionFromShopify({
      shop,
      subscription,
      fallbackPlan: getPlan(local?.planKey, plans),
      plans,
    });
  } else if (local) {
    await prisma.appSubscription.update({
      where: { id: local.id },
      data: {
        status: mapShopifySubscriptionStatus(webhookStatus),
        ...(mapShopifySubscriptionStatus(webhookStatus) === "CANCELLED"
          ? { cancelledAt: local.cancelledAt ?? new Date() }
          : {}),
      },
    });
  }

  return new Response();
};
