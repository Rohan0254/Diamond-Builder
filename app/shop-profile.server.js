// Server-side shop-profile capture.
//
// When a merchant installs the app we read their store's business information
// from the Admin API `Shop` object and store it in `ShopProfile`, keyed by the
// myshopify domain. This is wired two ways:
//   - the `afterAuth` install hook (`app/shopify.server.js`) captures it at
//     install / re-auth time, and
//   - `ensureShopProfile` lazily captures it for shops installed before this
//     feature existed (called from the app shell loader).
//
// Everything here is best-effort and never throws: a GraphQL failure, a missing
// session, or a DB error is logged and returns null so it can never break the
// install flow or a page load. Nothing is fabricated.

import prisma from "./db.server";
import {
  SHOP_PROFILE_QUERY,
  normalizeShopProfileResponse,
} from "./lib/shop-profile";

/** How long a stored profile is considered fresh before a lazy refresh. */
export const SHOP_PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Normalizes a shop domain from the authenticated session. */
export function normalizeShop(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Reads the shop profile from the Admin API. Returns a normalized record or
 * null (never throws).
 */
export async function fetchShopProfile(admin) {
  if (!admin?.graphql) return null;
  try {
    const response = await admin.graphql(SHOP_PROFILE_QUERY);
    const payload = await response.json();
    return normalizeShopProfileResponse(payload);
  } catch (error) {
    console.error("[shop-profile] could not read the shop profile", error);
    return null;
  }
}

/**
 * Upserts a normalized profile. `installedAt` is only set on first insert; every
 * sync updates `lastSyncedAt`.
 */
export async function upsertShopProfile(shop, profile, now = new Date()) {
  const domain = normalizeShop(shop);
  if (!domain || !profile) return null;
  const data = { ...profile, lastSyncedAt: now };
  return prisma.shopProfile.upsert({
    where: { shop: domain },
    create: { shop: domain, installedAt: now, ...data },
    update: data,
  });
}

/** Fetches the current profile and persists it. Best-effort; null on failure. */
export async function syncShopProfile({ shop, admin, now = new Date() } = {}) {
  try {
    const profile = await fetchShopProfile(admin);
    if (!profile) return null;
    return await upsertShopProfile(shop, profile, now);
  } catch (error) {
    console.error("[shop-profile] sync failed", error);
    return null;
  }
}

/** The stored profile for a shop, or null. May throw on a DB error. */
export async function getShopProfile(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return null;
  return prisma.shopProfile.findUnique({ where: { shop: domain } });
}

/**
 * Returns the stored profile, refreshing it from Shopify when it is missing or
 * older than `maxAgeMs`. Never throws.
 */
export async function ensureShopProfile({
  shop,
  admin,
  maxAgeMs = SHOP_PROFILE_MAX_AGE_MS,
  now = new Date(),
} = {}) {
  const domain = normalizeShop(shop);
  if (!domain) return null;

  try {
    const existing = await getShopProfile(domain);
    if (existing) {
      const age = now.getTime() - new Date(existing.lastSyncedAt).getTime();
      if (Number.isFinite(age) && age < maxAgeMs) return existing;
    }
    const synced = await syncShopProfile({ shop: domain, admin, now });
    return synced ?? existing ?? null;
  } catch (error) {
    console.error("[shop-profile] ensure failed", error);
    return null;
  }
}
