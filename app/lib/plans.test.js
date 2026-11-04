import test from "node:test";
import assert from "node:assert/strict";
import { PLANS, PLAN_KEYS, COMPARISON_ROWS, getPlan, isValidPlanKey, formatPrice, findPlanByPrice, getPublicPlans, normalizePlan, planToRecord, withBillingCycle } from "./plans.js";
import { buildSubscriptionCreateVariables, mapShopifySubscriptionToRecord } from "./billing.js";

test("BYOR catalog has the requested USD prices and annual totals", () => {
  assert.deepEqual(PLAN_KEYS, ["free","basic","advance"]);
  assert.deepEqual(PLANS.map(p => [p.key,p.currency,p.price,p.annualPrice]), [
    ["free","USD",0,0], ["basic","USD",39,390], ["advance","USD",110,1100]
  ]);
  assert.deepEqual(PLANS.filter(p => p.popular).map(p => p.key), ["advance"]);
  assert.equal(getPlan("free").trialDays,0);
});
test("monthly and annual selections produce exact server-controlled Shopify amounts", () => {
  for (const key of ["basic","advance"]) {
    for (const cycle of ["monthly","yearly"]) {
      const original = getPlan(key);
      const plan = withBillingCycle(original,cycle);
      const variables = buildSubscriptionCreateVariables({plan,returnUrl:"https://example.com/return",test:true,trialDays:0});
      const details = variables.lineItems[0].plan.appRecurringPricingDetails;
      assert.equal(details.price.amount,cycle === "yearly" ? original.annualPrice : original.price);
      assert.equal(details.price.currencyCode,"USD");
      assert.equal(details.interval,cycle === "yearly" ? "ANNUAL" : "EVERY_30_DAYS");
      assert.equal(original.price,getPlan(key).price);
      assert.equal(plan.entitlements.advancedCss,cycle === "yearly");
    }
  }
});
test("annual selection rejects unsupported cycles and missing annual prices", () => {
  assert.throws(() => withBillingCycle(getPlan("basic"),"weekly"));
  assert.throws(() => withBillingCycle({...getPlan("basic"),annualPrice:null},"yearly"));
});
test("Free stays free in both cycle views", () => {
  assert.equal(withBillingCycle(getPlan("free"),"yearly").price,0);
  assert.equal(withBillingCycle(getPlan("free"),"yearly").entitlements.advancedCss,false);
});
test("inventory, AI and logo limits match the requested tiers", () => {
  assert.deepEqual(PLANS.map(p=>p.entitlements.aiMessagesPerMonth),[20,40,100]);
  assert.deepEqual(PLANS.map(p=>p.entitlements.nivodaInventoryPercent),[0,50,100]);
  assert.deepEqual(PLANS.map(p=>p.entitlements.ownInventoryPercent),[30,50,100]);
  assert.deepEqual(PLANS.map(p=>p.entitlements.logoRemoval),[false,false,true]);
  assert.ok(PLANS.every(p=>p.entitlements.uploadLimitMb===2));
  for (const p of PLANS) for (const row of COMPARISON_ROWS) assert.equal(typeof p.entitlements[row.key],"boolean");
});
test("plan keys and prices are validated against catalog", () => {
  assert.equal(getPlan("unknown"),null);
  assert.equal(getPlan(null),null);
  assert.equal(isValidPlanKey("free"),true);
  assert.equal(isValidPlanKey("pro"),false);
  assert.equal(formatPrice(getPlan("basic")),"$39.00");
  assert.equal(findPlanByPrice(1100,"usd").key,"advance");
  assert.equal(findPlanByPrice(110,"EUR"),null);
  assert.equal(findPlanByPrice(99,"USD"),null);
});
test("annual prices survive public, normalized and database representations", () => {
  for (const plan of PLANS) {
    assert.equal(normalizePlan(planToRecord(plan)).annualPrice,plan.annualPrice);
    assert.equal(getPublicPlans([plan])[0].annualPrice,plan.annualPrice);
  }
  assert.equal(normalizePlan(null),null);
  const copy=getPublicPlans(); copy[0].features.push("changed");
  assert.ok(!PLANS[0].features.includes("changed"));
});
test("annual reconciliation preserves tier and billing interval", () => {
  const subscription={id:"gid://shopify/AppSubscription/1",status:"ACTIVE",lineItems:[{plan:{pricingDetails:{price:{amount:1100,currencyCode:"USD"},interval:"ANNUAL"}}}]};
  const record=mapShopifySubscriptionToRecord({shop:"demo.myshopify.com",subscription});
  assert.equal(record.planKey,"advance");
  assert.equal(record.price,1100);
  assert.equal(record.billingInterval,"ANNUAL");
});
