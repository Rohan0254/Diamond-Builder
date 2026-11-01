// Shop data erasure.
//
// Shopify sends the mandatory `shop/redact` compliance webhook 48 hours after a
// merchant uninstalls the app, and the app is required to erase everything it
// holds for that shop. This app only ever stores store-level data — the app
// scopes are `read_themes`, `write_products`, `write_metaobjects` and
// `write_metaobject_definitions`, so no customer or order data is ever
// requested or kept:
//
//   Session            — offline/online session records for the shop
//   AppSubscription    — the local billing mirror (no tokens or payment data)
//   ShopProfile        — the merchant's own store info from the Admin API
//   SetupVerification  — the latest script-verification snapshot
//   SupportTicket      — support requests the merchant submitted in the app
//

import prisma from "./db.server";

/**
 * Erases all stored data for one shop.
 *
 * Deletions are idempotent (`shop/redact` can be delivered more than once, and
 * a shop that never stored anything must not fail) and they run in sequence so
 * one failing collection can't hide the others. A genuine database failure is
 * thrown on purpose: the webhook then answers with a 5xx and Shopify retries
 * the delivery.
 *
 * @param {string} shop myshopify domain from the verified webhook payload
 * @returns {Promise<Record<string, number>>} deleted row counts per collection
 */
export async function redactShopData(shop) {
  if (!shop) return {};

  const where = { shop };
  const deleted = {};

  // Order matches the comment above so a failure log points at the collection
  // by name. Counts are returned for the webhook's log line.
  const collections = [
    ["session", prisma.session],
    ["appSubscription", prisma.appSubscription],
    ["shopProfile", prisma.shopProfile],
    ["setupVerification", prisma.setupVerification],
    ["supportTicket", prisma.supportTicket],
  ];

  for (const [name, collection] of collections) {
    const { count } = await collection.deleteMany({ where });
    deleted[name] = count;
  }

  return deleted;
}
