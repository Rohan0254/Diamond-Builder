import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { syncShopProfile } from "./shop-profile.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl:
    process.env.SHOPIFY_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Runs on install (and re-auth). Best-effort: failures are logged inside
    // syncShopProfile and can never break the install flow.
    afterAuth: async ({ session, admin }) => {
      await syncShopProfile({ shop: session.shop, admin });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

/**
 * Wraps `authenticate.admin` so auth failures are visible instead of a
 * sanitized "Unexpected Server Error".
 *
 * The Shopify library signals its own flows (install, bounce, reauth, exit
 * iframe, 401 session-token errors) by throwing Response objects — those are
 * re-thrown untouched so React Router and the browser handle them normally.
 *
 * Real failures (e.g. a missing session that forces a token exchange the
 * merchant clearly wants, or DB errors during session lookup) produce a
 * readable { ok: false, error } result instead of a silent 500. The library
 * swallows the underlying reason for a rejected token exchange into a bare
 * 500 Response, so we surface a targeted message (SCOPES/API secret are the
 * usual culprits).
 *
 * @param {Request} request
 * @param {string} [route] Label for log lines (e.g. "plan.loader")
 */
export async function authenticateAdminOrDiagnose(request, route = "route") {
  try {
    return { ok: true, context: await authenticate.admin(request) };
  } catch (error) {
    if (error instanceof Response) {
      if (error.status >= 500) {
        console.error(
          `[${route}] Shopify rejected authentication with status ${error.status}`,
          error.statusText,
        );
        return {
          ok: false,
          error:
            "Shopify rejected this request's authentication (token exchange). " +
            "Usually this is a SCOPES mismatch: the scopes set on the server must " +
            "exactly match the scopes the app was installed with. Verify " +
            "SHOPIFY_API_SECRET matches the app too.",
        };
      }
      // Library-managed flows (install/bounce/reauth/401s/redirects) — let
      // React Router and the browser handle them normally.
      throw error;
    }
    console.error(`[${route}] authenticate.admin threw`, error?.stack ?? error);
    return {
      ok: false,
      error: `Authentication failed: ${error?.message ?? String(error)}`,
    };
  }
}
