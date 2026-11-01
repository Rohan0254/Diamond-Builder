// Database-backed subscription plans.
//
// `Plan` (MongoDB) is the source of truth for the pricing page and for the price
// passed to Shopify's `appSubscriptionCreate`. Reads happen on every request
// (there is no cache), so editing a row in the database — price, name,
// description, features, entitlements, active, position — is reflected the next
// time the page loads.
//
// The built-in `PLANS` list in `app/lib/plans.js` is only used to seed an empty
// collection and as a fallback if the database is unreachable, so billing can
// never break because a read failed.

import prisma from "./db.server";
import { PLANS, getPublicPlans, normalizePlan, planToRecord } from "./lib/plans";

/** Display order: explicit `position`, then key for stability. */
const ORDER_BY = [{ position: "asc" }, { key: "asc" }];

/**
 * Inserts the built-in default plans into an empty `Plan` collection. Idempotent
 * and safe under concurrency: a duplicate insert (unique `key`) is ignored.
 */
export async function seedDefaultPlans() {
  let inserted = 0;
  for (const [index, plan] of PLANS.entries()) {
    try {
      await prisma.plan.create({ data: planToRecord(plan, index) });
      inserted += 1;
    } catch (error) {
      // P2002 = unique constraint violation: another request seeded it first.
      if (error?.code !== "P2002") throw error;
    }
  }
  return inserted;
}

/**
 * All plans from the database (including inactive ones), in display order.
 * Seeds the collection on first read when empty. Falls back to the built-in
 * defaults if the database is unavailable — never throws.
 */
export async function getPlans() {
  try {
    let rows = await prisma.plan.findMany({ orderBy: ORDER_BY });
    if (rows.length === 0) {
      await seedDefaultPlans();
      rows = await prisma.plan.findMany({ orderBy: ORDER_BY });
    }
    if (rows.length > 0) return rows.map(normalizePlan);
  } catch (error) {
    console.error("[plans] could not read the Plan collection", error);
  }
  return PLANS.map(normalizePlan);
}

/** Plans shown to merchants (active only), in display order. */
export async function getActivePlans() {
  const plans = await getPlans();
  return plans.filter((plan) => plan.active !== false);
}

/** Serializable plan list for the pricing UI. */
export async function getPublicPlanList() {
  return getPublicPlans(await getActivePlans());
}

/**
 * A single plan by key, including inactive plans (so an existing subscription to
 * a plan that was later deactivated still reconciles). Falls back to the built-in
 * defaults if the database is unreachable.
 */
export async function getPlanByKey(planKey) {
  if (typeof planKey !== "string" || planKey.trim() === "") return null;
  try {
    const row = await prisma.plan.findUnique({ where: { key: planKey } });
    if (row) return normalizePlan(row);
  } catch (error) {
    console.error("[plans] could not read plan", planKey, error);
  }
  return PLANS.map(normalizePlan).find((plan) => plan.key === planKey) ?? null;
}
