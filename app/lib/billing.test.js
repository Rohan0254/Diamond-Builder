import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEmbeddedAppBase,
  buildEmbeddedReturnUrl,
  buildSubscriptionCreateVariables,
  computeTrialDays,
  computeTrialEndsAt,
  extractGraphqlErrors,
  isActiveStatus,
  isDuplicatePending,
  isTerminalStatus,
  mapShopifySubscriptionStatus,
  mapShopifySubscriptionToRecord,
  parseSubscriptionCreateResponse,
  parseWebhookSubscriptionId,
  parseWebhookStatus,
  resolveWebhookAction,
  selectRecurringPricing,
  toAppSubscriptionGid,
} from "./billing.js";
import { getPlan } from "./plans.js";

const proPlan = getPlan("pro");

function makeSubscription(overrides = {}) {
  return {
    id: "gid://shopify/AppSubscription/1",
    name: "Pro",
    status: "ACTIVE",
    test: false,
    trialDays: 14,
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPeriodEnd: "2026-02-15T00:00:00.000Z",
    lineItems: [
      {
        id: "gid://shopify/AppSubscriptionLineItem/1",
        plan: {
          pricingDetails: {
            price: { amount: "19.99", currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
    ...overrides,
  };
}

test("mapShopifySubscriptionStatus normalises Shopify statuses", () => {
  assert.equal(mapShopifySubscriptionStatus("ACTIVE"), "ACTIVE");
  assert.equal(mapShopifySubscriptionStatus("ACCEPTED"), "ACTIVE");
  assert.equal(mapShopifySubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapShopifySubscriptionStatus("PENDING"), "PENDING");
  assert.equal(mapShopifySubscriptionStatus("DECLINED"), "DECLINED");
  assert.equal(mapShopifySubscriptionStatus("EXPIRED"), "EXPIRED");
  assert.equal(mapShopifySubscriptionStatus(undefined), "PENDING");
});

test("status helpers", () => {
  assert.equal(isActiveStatus("ACTIVE"), true);
  assert.equal(isActiveStatus("DECLINED"), false);
  assert.equal(isTerminalStatus("CANCELLED"), true);
  assert.equal(isTerminalStatus("DECLINED"), true);
  assert.equal(isTerminalStatus("ACTIVE"), false);
});

test("successful subscription creation parses the confirmation URL", () => {
  const result = parseSubscriptionCreateResponse({
    data: {
      appSubscriptionCreate: {
        appSubscription: { id: "gid://shopify/AppSubscription/99", status: "PENDING" },
        confirmationUrl:
          "https://admin.shopify.com/store/demo/charges/abc/confirm",
        userErrors: [],
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.subscription.id, "gid://shopify/AppSubscription/99");
  assert.match(result.confirmationUrl, /confirm$/);
});

test("a declined / rejected approval surfaces user errors and is not ok", () => {
  const result = parseSubscriptionCreateResponse({
    data: {
      appSubscriptionCreate: {
        appSubscription: null,
        confirmationUrl: null,
        userErrors: [{ field: null, message: "Merchant declined the charge" }],
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.userErrors.length, 1);
  assert.match(result.userErrors[0].message, /declined/i);
});

test("transport level GraphQL errors are surfaced", () => {
  const result = parseSubscriptionCreateResponse({
    errors: [{ message: "Access denied for appSubscriptionCreate" }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.graphqlErrors, [
    "Access denied for appSubscriptionCreate",
  ]);
  assert.equal(extractGraphqlErrors({ errors: [{ message: "x" }] }).length, 1);
});

test("a missing confirmation URL is treated as a billing error", () => {
  const result = parseSubscriptionCreateResponse({
    data: {
      appSubscriptionCreate: {
        appSubscription: { id: "gid://shopify/AppSubscription/1" },
        confirmationUrl: null,
        userErrors: [],
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.confirmationUrl, null);
  assert.match(result.userErrors[0].message, /confirmation URL/i);
});

test("buildSubscriptionCreateVariables builds a recurring line item", () => {
  const variables = buildSubscriptionCreateVariables({
    plan: proPlan,
    returnUrl: "https://app.example.com/app/plan",
    test: true,
    trialDays: 14,
    replacementBehavior: undefined,
  });
  assert.equal(variables.name, "Pro");
  assert.equal(variables.test, true);
  assert.equal(variables.trialDays, 14);
  assert.equal(variables.replacementBehavior, undefined);
  const details = variables.lineItems[0].plan.appRecurringPricingDetails;
  assert.equal(details.interval, "EVERY_30_DAYS");
  assert.equal(details.price.amount, 19.99);
  assert.equal(details.price.currencyCode, "USD");
});

test("buildSubscriptionCreateVariables passes replacement behaviour for changes", () => {
  const variables = buildSubscriptionCreateVariables({
    plan: proPlan,
    returnUrl: "https://app.example.com/app/plan",
    test: false,
    trialDays: 0,
    replacementBehavior: "APPLY_IMMEDIATELY",
  });
  assert.equal(variables.replacementBehavior, "APPLY_IMMEDIATELY");
  assert.equal(variables.trialDays, 0);
});

test("buildEmbeddedAppBase targets the Shopify admin for an embedded shop", () => {
  assert.equal(
    buildEmbeddedAppBase({
      appUrl: "https://app.example.com",
      apiKey: "abc123",
      shop: "speed-scatcher.myshopify.com",
    }),
    "https://admin.shopify.com/store/speed-scatcher/apps/abc123",
  );
  // Falls back to the app host when the shop/API key is unavailable.
  assert.equal(
    buildEmbeddedAppBase({
      appUrl: "https://app.example.com/",
      apiKey: "",
      shop: "",
    }),
    "https://app.example.com",
  );
});

test("buildEmbeddedReturnUrl returns to the admin, not the app host", () => {
  const url = buildEmbeddedReturnUrl({
    appUrl: "https://app.example.com",
    apiKey: "abc123",
    shop: "speed-scatcher.myshopify.com",
    host: "YWRtaW4=",
    path: "/app/setup",
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://admin.shopify.com");
  assert.equal(parsed.pathname, "/store/speed-scatcher/apps/abc123/app/setup");
  assert.equal(parsed.searchParams.get("shop"), "speed-scatcher.myshopify.com");
  assert.equal(parsed.searchParams.get("host"), "YWRtaW4=");
  assert.equal(parsed.searchParams.get("embedded"), "1");
});

test("buildEmbeddedReturnUrl defaults to /app/setup and drops stale charge_id", () => {
  const url = buildEmbeddedReturnUrl({
    appUrl: "https://app.example.com",
    apiKey: "abc123",
    shop: "speed-scatcher.myshopify.com",
    host: "YWRtaW4=",
  });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/store/speed-scatcher/apps/abc123/app/setup");
  assert.equal(parsed.searchParams.get("charge_id"), null);
});

test("buildEmbeddedReturnUrl falls back to the app host without an API key", () => {
  const url = buildEmbeddedReturnUrl({
    appUrl: "https://app.example.com",
    apiKey: "",
    shop: "speed-scatcher.myshopify.com",
    path: "/app/plan",
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://app.example.com");
  assert.equal(parsed.pathname, "/app/plan");
});

test("computeTrialDays only grants a trial to first-time subscribers", () => {
  assert.equal(computeTrialDays(false, 14), 14);
  assert.equal(computeTrialDays(true, 14), 0);
});

test("selectRecurringPricing reads the recurring price and interval", () => {
  const pricing = selectRecurringPricing(makeSubscription());
  assert.deepEqual(pricing, {
    amount: 19.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
  });
  assert.equal(selectRecurringPricing({ lineItems: [] }), null);
});

test("computeTrialEndsAt derives dates from authoritative data only", () => {
  const end = computeTrialEndsAt("2026-01-01T00:00:00.000Z", 14);
  assert.equal(end.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal(computeTrialEndsAt(null, 14), null);
  assert.equal(computeTrialEndsAt("2026-01-01T00:00:00.000Z", 0), null);
});

test("mapShopifySubscriptionToRecord maps an active Pro subscription", () => {
  const record = mapShopifySubscriptionToRecord({
    shop: "demo.myshopify.com",
    subscription: makeSubscription(),
  });
  assert.equal(record.shop, "demo.myshopify.com");
  assert.equal(record.planKey, "pro");
  assert.equal(record.planName, "Pro");
  assert.equal(record.price, 19.99);
  assert.equal(record.status, "ACTIVE");
  assert.equal(record.billingInterval, "EVERY_30_DAYS");
  assert.equal(record.shopifySubscriptionId, "gid://shopify/AppSubscription/1");
  assert.equal(record.trialEndsAt.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal(
    record.currentPeriodEnd.toISOString(),
    "2026-02-15T00:00:00.000Z",
  );
});

test("mapShopifySubscriptionToRecord falls back for unknown prices", () => {
  const record = mapShopifySubscriptionToRecord({
    shop: "demo.myshopify.com",
    subscription: makeSubscription({
      name: "Legacy",
      lineItems: [
        {
          plan: {
            pricingDetails: {
              price: { amount: "99.00", currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    }),
    fallbackPlan: getPlan("basic"),
  });
  assert.equal(record.planKey, "basic");
});

test("webhook payload helpers extract id and status", () => {
  const payload = {
    app_subscription: {
      admin_graphql_api_id: "gid://shopify/AppSubscription/42",
      status: "CANCELLED",
    },
  };
  assert.equal(
    parseWebhookSubscriptionId(payload),
    "gid://shopify/AppSubscription/42",
  );
  assert.equal(parseWebhookStatus(payload), "CANCELLED");
  assert.equal(parseWebhookSubscriptionId({}), null);
});

test("toAppSubscriptionGid normalizes the billing return charge_id", () => {
  assert.equal(
    toAppSubscriptionGid("88502403153"),
    "gid://shopify/AppSubscription/88502403153",
  );
  assert.equal(
    toAppSubscriptionGid("gid://shopify/AppSubscription/88502403153"),
    "gid://shopify/AppSubscription/88502403153",
  );
  assert.equal(toAppSubscriptionGid(" 42 "), "gid://shopify/AppSubscription/42");
  assert.equal(toAppSubscriptionGid(""), null);
  assert.equal(toAppSubscriptionGid(null), null);
  assert.equal(toAppSubscriptionGid(undefined), null);
});

test("resolveWebhookAction creates, applies, ignores and de-duplicates", () => {
  assert.equal(
    resolveWebhookAction({ local: null, incoming: { id: "1", status: "ACTIVE" } })
      .action,
    "create",
  );
  assert.equal(
    resolveWebhookAction({
      local: { status: "PENDING", shopifySubscriptionId: "1" },
      incoming: { id: "1", status: "ACTIVE" },
    }).action,
    "apply",
  );
  assert.equal(
    resolveWebhookAction({
      local: { status: "ACTIVE", shopifySubscriptionId: "1" },
      incoming: { id: "1", status: "ACTIVE" },
    }).action,
    "noop",
  );
  assert.equal(
    resolveWebhookAction({
      local: { status: "ACTIVE", shopifySubscriptionId: "1" },
      incoming: { id: "2", status: "CANCELLED" },
    }).action,
    "ignore",
  );
  assert.equal(
    resolveWebhookAction({ local: null, incoming: { status: "ACTIVE" } }).action,
    "ignore",
  );
});

test("duplicate webhook deliveries are detected as no-ops", () => {
  const local = { status: "ACTIVE", shopifySubscriptionId: "1" };
  const first = resolveWebhookAction({
    local,
    incoming: { id: "1", status: "CANCELLED" },
  });
  const second = resolveWebhookAction({
    local: { ...local, status: "CANCELLED" },
    incoming: { id: "1", status: "CANCELLED" },
  });
  assert.equal(first.action, "apply");
  assert.equal(second.action, "noop");
});

test("isDuplicatePending blocks recent pending records only", () => {
  const now = Date.now();
  const records = [
    {
      status: "PENDING",
      confirmationInitiatedAt: new Date(now - 30 * 1000),
      shopifySubscriptionId: "gid://1",
    },
  ];
  assert.equal(isDuplicatePending(records, { now, windowMs: 120000 })?.shopifySubscriptionId, "gid://1");
  assert.equal(
    isDuplicatePending(records, { now, windowMs: 10000 }),
    null,
  );
  assert.equal(
    isDuplicatePending(
      [{ status: "ACTIVE", createdAt: new Date(now) }],
      { now, windowMs: 120000 },
    ),
    null,
  );
  assert.equal(isDuplicatePending([], { now }) , null);
});
