import test from "node:test";
import assert from "node:assert/strict";

import {
  BILLING_INTERVAL,
  COMPARISON_ROWS,
  PLAN_KEYS,
  PLANS,
  TRIAL_DAYS,
  TRIAL_ROW_LABEL,
  findPlanByPrice,
  formatPrice,
  getPlan,
  getPublicPlans,
  isValidPlanKey,
  normalizePlan,
  planToRecord,
} from "./plans.js";

test("exactly three plans are configured", () => {
  assert.equal(PLANS.length, 3);
  assert.deepEqual(
    PLANS.map((plan) => plan.key),
    ["basic", "pro", "advanced"],
  );
  assert.deepEqual(PLAN_KEYS, ["basic", "pro", "advanced"]);
});

test("every plan has a 14-day trial and a monthly recurring interval", () => {
  for (const plan of PLANS) {
    assert.equal(plan.trialDays, 14);
    assert.equal(plan.interval, BILLING_INTERVAL);
    assert.equal(plan.currency, "USD");
  }
  assert.equal(TRIAL_DAYS, 14);
});

test("plans match the required prices, names and descriptions", () => {
  assert.deepEqual(
    PLANS.map((plan) => [plan.key, plan.name, plan.price, plan.description]),
    [
      ["basic", "Basic", 9.99, "Perfect for growing stores"],
      ["pro", "Pro", 19.99, "Best for established stores"],
      ["advanced", "Advanced", 39.99, "For high-volume stores"],
    ],
  );
});

test("only Pro is marked as the popular plan", () => {
  assert.deepEqual(
    PLANS.filter((plan) => plan.popular).map((plan) => plan.key),
    ["pro"],
  );
});

test("comparison rows are covered by every plan's entitlements", () => {
  assert.equal(COMPARISON_ROWS.length, 10);
  for (const plan of PLANS) {
    for (const row of COMPARISON_ROWS) {
      assert.equal(
        typeof plan.entitlements[row.key],
        "boolean",
        `${plan.key} is missing entitlement ${row.key}`,
      );
    }
  }
  assert.equal(TRIAL_ROW_LABEL, "Trial duration");
});

test("higher tiers include the lower tier entitlements", () => {
  const basic = getPlan("basic").entitlements;
  const pro = getPlan("pro").entitlements;
  const advanced = getPlan("advanced").entitlements;
  assert.equal(basic.coreWebVitals, false);
  assert.equal(pro.coreWebVitals, true);
  assert.equal(pro.prioritySupport, true);
  assert.equal(advanced.customRules, true);
  assert.equal(advanced.dedicatedSupport, true);
});

test("getPlan / isValidPlanKey validate server-side", () => {
  assert.equal(getPlan("pro").name, "Pro");
  assert.equal(getPlan("enterprise"), null);
  assert.equal(getPlan(null), null);
  assert.equal(getPlan(42), null);
  assert.equal(isValidPlanKey("advanced"), true);
  assert.equal(isValidPlanKey("free"), false);
});

test("formatPrice renders USD amounts", () => {
  assert.equal(formatPrice(getPlan("basic")), "$9.99");
  assert.equal(formatPrice(getPlan("advanced")), "$39.99");
});

test("findPlanByPrice maps authoritative Shopify prices back to plans", () => {
  assert.equal(findPlanByPrice(19.99, "USD").key, "pro");
  assert.equal(findPlanByPrice("39.99", "usd").key, "advanced");
  assert.equal(findPlanByPrice(49.99, "USD"), null);
});

test("getPublicPlans never leaks non-serializable config", () => {
  const publicPlans = getPublicPlans();
  assert.equal(publicPlans.length, 3);
  assert.ok(publicPlans.every((plan) => typeof plan.price === "number"));
  // Mutating the returned data must not affect the source config.
  publicPlans[0].features.push("hacked");
  assert.ok(!getPlan("basic").features.includes("hacked"));
});

test("helpers operate on a database plan list when one is provided", () => {
  const dbPlans = [
    {
      key: "pro",
      name: "Pro",
      price: 24.99,
      currency: "USD",
      interval: BILLING_INTERVAL,
      trialDays: TRIAL_DAYS,
      description: "",
      popular: true,
      features: ["a"],
      entitlements: { a: true },
    },
  ];
  assert.equal(getPlan("pro", dbPlans).price, 24.99);
  assert.equal(getPlan("basic", dbPlans), null);
  assert.equal(isValidPlanKey("pro", dbPlans), true);
  assert.equal(isValidPlanKey("basic", dbPlans), false);

  const [pub] = getPublicPlans(dbPlans);
  assert.equal(pub.price, 24.99);
  assert.deepEqual(pub.features, ["a"]);

  assert.equal(findPlanByPrice(24.99, "usd", dbPlans).key, "pro");
  assert.equal(findPlanByPrice(19.99, "USD", dbPlans), null);
});

test("normalizePlan is null-safe and coerces hand-edited rows", () => {
  assert.equal(normalizePlan(null), null);
  assert.equal(normalizePlan(undefined), null);

  const plan = normalizePlan({ key: "pro", name: null, price: "24.99" });
  assert.equal(plan.key, "pro");
  assert.equal(plan.name, "pro"); // falls back to the key, never null
  assert.equal(plan.price, 24.99); // string coerced to number
  assert.equal(plan.currency, "USD");
  assert.equal(plan.interval, BILLING_INTERVAL);
  assert.equal(plan.trialDays, TRIAL_DAYS);
  assert.deepEqual(plan.features, []);
  assert.deepEqual(plan.entitlements, {});
  assert.equal(plan.active, true);
  assert.equal(plan.position, 0);

  assert.equal(
    normalizePlan({ key: "pro", name: "Pro", price: 1, active: false }).active,
    false,
  );

  const withLists = normalizePlan({
    key: "pro",
    name: "Pro",
    price: 1,
    features: ["x", "y"],
    entitlements: { speedOptimization: true },
    position: 2,
  });
  assert.deepEqual(withLists.features, ["x", "y"]);
  assert.deepEqual(withLists.entitlements, { speedOptimization: true });
  assert.equal(withLists.position, 2);
});

test("planToRecord builds a seed record and keeps the display order", () => {
  const record = planToRecord(getPlan("advanced"), 2);
  assert.equal(record.key, "advanced");
  assert.equal(record.price, 39.99);
  assert.equal(record.currency, "USD");
  assert.equal(record.interval, BILLING_INTERVAL);
  assert.equal(record.trialDays, TRIAL_DAYS);
  assert.equal(record.position, 2);
  assert.equal(record.active, true);
  assert.deepEqual(record.features, getPlan("advanced").features);
  assert.deepEqual(record.entitlements, getPlan("advanced").entitlements);
});
