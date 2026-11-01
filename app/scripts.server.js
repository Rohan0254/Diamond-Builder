// Per-shop script generation for the Setup page.
//
// This is the JS port of the legacy PHP `getOrCreateUserScript`:
//   1. read the shop's `ShopProfile` (its Mongo `_id` is the user/website id),
//   2. read the script template from the `Script` collection for the platform
//      (`shopify`, falling back to `default`),
//   3. substitute the `{{...}}` placeholders,
//   4. obfuscate the JavaScript (javascript-obfuscator; falls back to the raw
//      text on any failure),
//   5. upload it to BunnyCDN at `scripts/{id}/scrachar_{id}.js` and purge the
//      cache.
//
// The Setup page then shows a `<script src="{cdnUrl}">` snippet. Nothing is
// fabricated: when Bunny is not configured, the template is missing, or an
// upload fails, the caller falls back to the static placeholder definition.
// Generated URLs are cached on the `ShopProfile` so the CDN is not re-checked on
// every page load; pass `force` to re-generate.

import prisma from "./db.server";
import { ensureShopProfile, normalizeShop } from "./shop-profile.server";
import {
  getFileInfo,
  getUserCdnUrl,
  getUserScriptPath,
  isBunnyConfigured,
  purgeCache,
  readBunnyConfig,
  uploadFile,
} from "./lib/bunny";
import {
  applyScriptPlaceholders,
  buildScriptVariables,
  pickScriptTemplate,
} from "./lib/script-template";
import { obfuscateScript } from "./lib/obfuscate";
import { buildCdnInstallScript, buildScriptDefinition } from "./lib/scripts";

/** Platform used for a Shopify store (`Script.shopify`). */
export const SCRIPT_PLATFORM = "shopify";
/** Human label embedded in the snippet's `data-platform`. */
export const SCRIPT_PLATFORM_LABEL = "Shopify";

/**
 * Skip obfuscation above this size: `javascript-obfuscator` runs synchronously
 * on the event loop, and a very large template would block it. The script is
 * uploaded as-is instead (still correct, just not minified/obfuscated).
 */
export const MAX_OBFUSCATE_BYTES = 250 * 1024;

/** Loads the platform template from the `Script` collection (`default` fallback). */
export async function getShopScriptTemplate({
  platform = SCRIPT_PLATFORM,
  client = prisma,
} = {}) {
  // Only the template columns are selected. The `Script` collection can be
  // populated by hand (imported rows have no `createdAt`/`updatedAt`), and
  // reading those non-nullable timestamps makes Prisma throw on the whole
  // query — which silently prevented every upload. The newest row by id wins.
  const record = await client.script.findFirst({
    orderBy: { id: "desc" },
    select: {
      default: true,
      shopify: true,
      wix: true,
      bigcommerce: true,
      webflow: true,
      custom: true,
    },
  });
  return pickScriptTemplate(record, platform);
}

/** Builds the copyable definition for a CDN URL. */
function definitionFor({ cdnUrl, userId, websiteId }) {
  return buildScriptDefinition({
    script: buildCdnInstallScript({
      cdnUrl,
      userId,
      websiteId,
      platform: SCRIPT_PLATFORM_LABEL,
    }),
  });
}

async function cacheScriptUrl(shop, cdnUrl) {
  try {
    await prisma.shopProfile.update({
      where: { shop },
      data: { scriptCdnUrl: cdnUrl, scriptGeneratedAt: new Date() },
    });
  } catch (error) {
    // Caching is best-effort: the script is already uploaded and served.
    console.error("[scripts.server] failed to cache the script URL", error);
  }
}

/**
 * Returns the Setup script definitions for a shop, generating and uploading the
 * per-shop script to BunnyCDN on first use. Never throws.
 *
 * @returns {Promise<{ok:boolean, reason?:string, scripts:object[],
 *   cdnUrl?:string, uploaded?:boolean, reused?:boolean, purged?:boolean,
 *   message?:string}>}
 */
export async function getOrCreateSetupScript({
  shop,
  admin,
  force = false,
  env = process.env,
  fetchImpl,
} = {}) {
  const domain = normalizeShop(shop);
  if (!domain) return { ok: false, reason: "no-shop", scripts: [] };

  const config = readBunnyConfig(env);
  if (!isBunnyConfigured(config)) {
    return { ok: false, reason: "bunny-unconfigured", scripts: [] };
  }

  let profile = null;
  try {
    profile = await ensureShopProfile({ shop: domain, admin });
  } catch (error) {
    console.error("[scripts.server] could not load the shop profile", error);
  }
  if (!profile?.id) {
    return { ok: false, reason: "no-profile", scripts: [] };
  }

  // The store's Mongo `_id` is both the user id and the website id.
  const userId = String(profile.id);
  const websiteId = String(profile.id);
  const websiteUrl =
    profile.storeUrl ||
    (profile.primaryDomain
      ? `https://${profile.primaryDomain}`
      : `https://${domain}`);
  const host = profile.primaryDomainHost || profile.primaryDomain || domain;
  const remotePath = getUserScriptPath(userId);
  const cdnUrl = getUserCdnUrl(config, userId);

  // Fast path: this shop already generated its script (cached on the profile).
  if (!force && profile.scriptCdnUrl) {
    return {
      ok: true,
      uploaded: false,
      reused: true,
      cdnUrl: profile.scriptCdnUrl,
      scripts: [
        definitionFor({ cdnUrl: profile.scriptCdnUrl, userId, websiteId }),
      ],
    };
  }

  // Not cached yet: reuse an existing CDN file if there is one (e.g. the cached
  // row was lost), otherwise generate + upload.
  if (!force) {
    const info = await getFileInfo({ config, remotePath, fetchImpl });
    if (info.exists) {
      await cacheScriptUrl(domain, cdnUrl);
      return {
        ok: true,
        uploaded: false,
        reused: true,
        cdnUrl,
        scripts: [definitionFor({ cdnUrl, userId, websiteId })],
      };
    }
  }

  let template;
  try {
    template = await getShopScriptTemplate({ platform: SCRIPT_PLATFORM });
  } catch (error) {
    console.error("[scripts.server] could not read the script template", error);
    return { ok: false, reason: "template-read-failed", scripts: [] };
  }
  if (!template.content) {
    return { ok: false, reason: "no-template", scripts: [] };
  }

  const variables = buildScriptVariables({
    userId,
    platform: SCRIPT_PLATFORM_LABEL,
    websiteId,
    websiteUrl,
    domain: host,
  });
  const source = applyScriptPlaceholders(template.content, variables);
  const withinSizeLimit =
    Buffer.byteLength(source, "utf8") <= MAX_OBFUSCATE_BYTES;
  if (!withinSizeLimit) {
    console.warn(
      "[scripts.server] template exceeds the obfuscation size limit; uploading as-is",
    );
  }
  const content = await obfuscateScript(source, {
    enabled: config.obfuscate && withinSizeLimit,
  });

  const upload = await uploadFile({ config, remotePath, content, fetchImpl });
  if (!upload.success) {
    console.error(
      "[scripts.server] BunnyCDN upload failed:",
      upload.message ?? upload.status,
    );
    return {
      ok: false,
      reason: "upload-failed",
      message: upload.message,
      cdnUrl,
      scripts: [],
    };
  }

  const purge = await purgeCache({ config, url: cdnUrl, fetchImpl });
  await cacheScriptUrl(domain, cdnUrl);

  return {
    ok: true,
    uploaded: true,
    reused: false,
    purged: purge.success,
    cdnUrl,
    scripts: [definitionFor({ cdnUrl, userId, websiteId })],
  };
}
