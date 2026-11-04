// Shared BYOR catalog. Prices are server-controlled USD amounts.
export const CURRENCY_CODE = "USD";
export const BILLING_INTERVAL = "EVERY_30_DAYS";
export const TRIAL_DAYS = 14;
export const PLAN_KEYS = ["free", "basic", "advance"];
const common = ["Ring, Earring & Pendant Builders", "Appearance, Language & Region Manager"];
export const PLANS = [
  { key:"free", name:"Free", price:0, annualPrice:0, messages:20, inventory:0, own:30, extra:["Sample diamonds only (no Nivoda feed)", "Keyideas logo shown (cannot be removed)", "Add-ons, suppliers & CSS: not available"] },
  { key:"basic", name:"Basic", price:39, annualPrice:390, messages:40, inventory:50, own:50, extra:["Logo removal & add-ons: $330 each", "Advanced CSS (yearly plans only)"] },
  { key:"advance", name:"Advance", price:110, annualPrice:1100, messages:100, inventory:100, own:100, extra:["No Keyideas logo; add-ons $230 each", "Advanced CSS (yearly plans only)"] },
].map(({ messages, inventory, own, extra, ...plan }) => ({
  ...plan, currency:CURRENCY_CODE, interval:BILLING_INTERVAL,
  trialDays:plan.price === 0 ? 0 : TRIAL_DAYS,
  description:plan.price === 0 ? "Explore with sample diamonds" : "Build your jewelry shopping experience",
  popular:plan.key === "advance",
  features:[common[0], "AI Diamond Score + Ask AI: " + messages + " msgs/mo", common[1],
    ...(inventory ? ["Nivoda: " + inventory + "% of inventory (account required)"] : []),
    "Own diamonds (2MB upload): " + own + "% shown",
    "Free filters & engraving (limited time)", ...extra],
  entitlements:{builders:true, aiDiamondScore:true, appearanceManager:true, nivoda:inventory > 0,
    logoRemoval:plan.key === "advance", addOns:plan.price > 0, advancedCss:plan.price > 0,
    aiMessagesPerMonth:messages, nivodaInventoryPercent:inventory, ownInventoryPercent:own,
    uploadLimitMb:2, logoRemovalPrice:plan.key === "free" ? null : plan.key === "basic" ? 330 : 0,
    addOnPrice:plan.key === "free" ? null : plan.key === "basic" ? 330 : 230}
}));
export const COMPARISON_ROWS = [
  {key:"builders",label:"Ring, Earring & Pendant Builders"},
  {key:"aiDiamondScore",label:"AI Diamond Score + Ask AI"},
  {key:"appearanceManager",label:"Appearance, Language & Region Manager"},
  {key:"nivoda",label:"Nivoda inventory (account required)"},
  {key:"logoRemoval",label:"Logo removal included"},
  {key:"addOns",label:"Paid add-ons available"},
  {key:"advancedCss",label:"Advanced CSS (yearly plans only)"}
];
export const TRIAL_ROW_LABEL = "Trial duration";

export function withBillingCycle(plan, cycle = "monthly") {
  if (cycle !== "monthly" && cycle !== "yearly") throw new Error("Invalid billing cycle");
  if (cycle === "yearly" && plan.price > 0 && !(plan.annualPrice > 0)) throw new Error("Annual billing is unavailable for this plan");
  return {...plan, price:cycle === "yearly" ? plan.annualPrice ?? 0 : plan.price,
    interval:cycle === "yearly" ? "ANNUAL" : BILLING_INTERVAL,
    entitlements:{...plan.entitlements, advancedCss:cycle === "yearly" && Boolean(plan.entitlements?.advancedCss)}};
}

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
    annualPrice: plan.annualPrice == null ? null : Number(plan.annualPrice),
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
        (Math.abs(Number(plan.price) - numericAmount) < 0.001 || (plan.annualPrice != null && Math.abs(Number(plan.annualPrice) - numericAmount) < 0.001)) &&
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
    annualPrice: row.annualPrice == null ? null : Number(row.annualPrice),
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
    annualPrice: plan.annualPrice ?? null,
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
