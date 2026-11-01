// Plan definitions and pure helpers shared by the server, the pricing UI and
// the tests.
//
// The authoritative plans live in the `Plan` collection in MongoDB (see
// `app/plans.server.js`): edit a row there — price, name, description, features,
// entitlements, active, position — and the app picks it up on the next request.
// The `PLANS` array below is only the built-in default used to seed an empty
// collection and as a last-resort fallback when the database is unreachable.
//
// This module is intentionally free of Shopify/Prisma imports so the pure
// transforms can be reused by the browser bundle and unit tested without IO.
// Prices/intervals/trials must never be trusted from the client.

export const CURRENCY_CODE = "USD";
export const BILLING_INTERVAL = "EVERY_30_DAYS";
export const TRIAL_DAYS = 14;

/** Ordered list of plan keys. The order here drives the UI. */
export const PLAN_KEYS = ["basic", "pro", "advanced"];

/**
 * Default (seed) plans. Inserted into the `Plan` collection the first time it is
 * read while empty, and used as a fallback if the database cannot be reached.
 * Runtime pricing comes from the database, not from this array.
 *
 * @type {ReadonlyArray<{
 *   key: string,
 *   name: string,
 *   price: number,
 *   currency: string,
 *   interval: string,
 *   trialDays: number,
 *   description: string,
 *   popular: boolean,
 *   features: string[],
 *   entitlements: Record<string, boolean>,
 * }>}
 */
export const PLANS = [
  {
    key: "basic",
    name: "Basic",
    price: 9.99,
    currency: CURRENCY_CODE,
    interval: BILLING_INTERVAL,
    trialDays: TRIAL_DAYS,
    description: "Perfect for growing stores",
    popular: false,
    features: [
      "Automatic speed optimization",
      "Image compression",
      "Lazy-load optimization",
      "Basic analytics",
      "Email support",
    ],
    entitlements: {
      speedOptimization: true,
      imageCompression: true,
      lazyLoad: true,
      coreWebVitals: false,
      jsCssOptimization: false,
      performanceRecommendations: false,
      customRules: false,
      advancedAnalytics: false,
      prioritySupport: false,
      dedicatedSupport: false,
    },
  },
  {
    key: "pro",
    name: "Pro",
    price: 19.99,
    currency: CURRENCY_CODE,
    interval: BILLING_INTERVAL,
    trialDays: TRIAL_DAYS,
    description: "Best for established stores",
    popular: true,
    features: [
      "All Basic features",
      "Advanced speed optimization",
      "Core Web Vitals improvements",
      "JavaScript and CSS optimization",
      "Performance recommendations",
      "Priority support",
    ],
    entitlements: {
      speedOptimization: true,
      imageCompression: true,
      lazyLoad: true,
      coreWebVitals: true,
      jsCssOptimization: true,
      performanceRecommendations: true,
      customRules: false,
      advancedAnalytics: false,
      prioritySupport: true,
      dedicatedSupport: false,
    },
  },
  {
    key: "advanced",
    name: "Advanced",
    price: 39.99,
    currency: CURRENCY_CODE,
    interval: BILLING_INTERVAL,
    trialDays: TRIAL_DAYS,
    description: "For high-volume stores",
    popular: false,
    features: [
      "All Pro features",
      "Advanced caching and optimization",
      "Custom optimization rules",
      "Advanced performance analytics",
      "Dedicated performance support",
    ],
    entitlements: {
      speedOptimization: true,
      imageCompression: true,
      lazyLoad: true,
      coreWebVitals: true,
      jsCssOptimization: true,
      performanceRecommendations: true,
      customRules: true,
      advancedAnalytics: true,
      prioritySupport: true,
      dedicatedSupport: true,
    },
  },
];

/**
 * Rows rendered in the "Compare plans" table. The keys map onto each plan's
 * `entitlements` object so the table can never drift from the plan config.
 * The trial row is rendered separately and always shows `TRIAL_DAYS`.
 */
export const COMPARISON_ROWS = [
  { key: "speedOptimization", label: "Automatic speed optimization" },
  { key: "imageCompression", label: "Image compression" },
  { key: "lazyLoad", label: "Lazy-load optimization" },
  { key: "coreWebVitals", label: "Core Web Vitals improvements" },
  { key: "jsCssOptimization", label: "JavaScript and CSS optimization" },
  { key: "performanceRecommendations", label: "Performance recommendations" },
  { key: "customRules", label: "Custom optimization rules" },
  { key: "advancedAnalytics", label: "Advanced analytics" },
  { key: "prioritySupport", label: "Priority support" },
  { key: "dedicatedSupport", label: "Dedicated performance support" },
];

export const TRIAL_ROW_LABEL = "Trial duration";

/**
 * Returns the plan configuration for a key, or `null` when unknown. Pass a
 * database-backed list to operate on live plans; defaults to the seed list.
 */
export function getPlan(planKey, plans = PLANS) {
  if (typeof planKey !== "string") return null;
  return plans.find((plan) => plan.key === planKey) ?? null;
}

/** Strict validation for plan keys coming from the client. */
export function isValidPlanKey(planKey, plans = PLANS) {
  return getPlan(planKey, plans) !== null;
}

/**
 * Safely serializable plan data for the browser. Deliberately mirrors exactly
 * the fields the UI needs and nothing else.
 */
export function getPublicPlans(plans = PLANS) {
  return plans.map((plan) => ({
    key: plan.key,
    name: plan.name,
    price: Number(plan.price ?? 0),
    currency: plan.currency ?? CURRENCY_CODE,
    interval: plan.interval ?? BILLING_INTERVAL,
    trialDays: Number(plan.trialDays ?? TRIAL_DAYS),
    description: plan.description ?? "",
    popular: Boolean(plan.popular),
    features: Array.isArray(plan.features) ? [...plan.features] : [],
    entitlements: { ...(plan.entitlements ?? {}) },
  }));
}

/** Formats a plan's monthly price for display, e.g. `$9.99`. */
export function formatPrice(plan) {
  const amount = Number(plan?.price ?? 0);
  const currency = plan?.currency ?? CURRENCY_CODE;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Finds a local plan matching an authoritative recurring price/currency pair
 * returned by Shopify. Used when reconciling a subscription we did not create
 * locally (for example, created on another device). Pass the live plan list so
 * matching uses database prices.
 */
export function findPlanByPrice(amount, currencyCode, plans = PLANS) {
  const numericAmount = Number(amount);
  const code = (currencyCode ?? CURRENCY_CODE).toUpperCase();
  return (
    plans.find(
      (plan) =>
        Math.abs(Number(plan.price) - numericAmount) < 0.001 &&
        String(plan.currency ?? CURRENCY_CODE).toUpperCase() === code,
    ) ?? null
  );
}

/**
 * Normalizes a `Plan` database row into the in-app plan shape. Null-safe: any
 * missing/invalid field falls back to a sensible default so a hand-edited row
 * can never crash the pricing page.
 */
export function normalizePlan(row) {
  if (!row || typeof row !== "object") return null;
  return {
    key: String(row.key),
    name: String(row.name ?? row.key ?? ""),
    price: Number.isFinite(Number(row.price)) ? Number(row.price) : 0,
    currency: row.currency ?? CURRENCY_CODE,
    interval: row.interval ?? BILLING_INTERVAL,
    trialDays: Number.isFinite(Number(row.trialDays))
      ? Number(row.trialDays)
      : TRIAL_DAYS,
    description: row.description ?? "",
    popular: Boolean(row.popular),
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    entitlements:
      row.entitlements && typeof row.entitlements === "object"
        ? { ...row.entitlements }
        : {},
    position: Number.isFinite(Number(row.position)) ? Number(row.position) : 0,
    active: row.active !== false,
  };
}

/**
 * Converts a default plan into a record for the `Plan` collection. Used only to
 * seed an empty collection; `position` preserves the display order of `PLANS`.
 */
export function planToRecord(plan, position = 0) {
  return {
    key: plan.key,
    name: plan.name,
    price: plan.price,
    currency: plan.currency ?? CURRENCY_CODE,
    interval: plan.interval ?? BILLING_INTERVAL,
    trialDays: plan.trialDays ?? TRIAL_DAYS,
    description: plan.description ?? "",
    popular: Boolean(plan.popular),
    position,
    active: true,
    features: [...(plan.features ?? [])],
    entitlements: { ...(plan.entitlements ?? {}) },
  };
}
