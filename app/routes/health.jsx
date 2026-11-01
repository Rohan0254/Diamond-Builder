import prisma from "../db.server";

/**
 * Unauthenticated diagnostic endpoint for deployment debugging (Render).
 * Returns 200 only when MongoDB is reachable and DATABASE_URL is configured.
 *
 * Never echoes secrets — only booleans, the URL scheme and short error class
 * names — so it is safe to open directly in a browser while the rest of the
 * app is 500ing (the 500 is caused by the authenticated session lookup, which
 * is backed by the same MongoDB connection this endpoint tests).
 */
export const loader = async () => {
  /* eslint-disable no-undef -- server-only Node globals */
  const env = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    databaseScheme: (process.env.DATABASE_URL ?? "").split("://")[0] || null,
    shopifyApiKey: Boolean(process.env.SHOPIFY_API_KEY),
    shopifyApiSecret: Boolean(process.env.SHOPIFY_API_SECRET),
    scopesCount: (process.env.SCOPES ?? "").split(",").filter(Boolean).length,
    appUrl: process.env.SHOPIFY_APP_URL || null,
    billingTestMode: process.env.BILLING_TEST_MODE ?? null,
  };
  /* eslint-enable no-undef */

  let db = { ok: false, error: null, ms: null };
  const startedAt = Date.now();
  try {
    await Promise.race([
      prisma.$runCommandRaw({ ping: 1 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("connection check timed out")), 5000),
      ),
    ]);
    db = { ok: true, error: null, ms: Date.now() - startedAt };
  } catch (error) {
    db = { ok: false, error: error?.constructor?.name ?? "Error", ms: Date.now() - startedAt };
  }

  // The "Unexpected Server Error" 500 on the plan actions is caused by a missing
  // `appSubscription` collection (prisma db push was never run against this
  // database). A ping above succeeds even when the collection is missing, so
  // check it explicitly:
  let appSubscriptionOk = null;
  try {
    await prisma.appSubscription.findFirst({ select: { id: true } });
    appSubscriptionOk = true;
  } catch (error) {
    appSubscriptionOk = false;
    if (db.ok) db.error = error?.message ?? "appSubscription check failed";
  }

  const ok = db.ok && env.databaseUrl && appSubscriptionOk;
  return Response.json(
    { ok, env, db, appSubscriptionOk },
    { status: ok ? 200 : 503 },
  );
};