import process from "node:process";
import prisma from "../db.server.js";
import { normalizeEnabledCategories } from "../lib/storefront-categories.js";

const GET_COLLECTIONS_QUERY = `#graphql
  query GetStoreCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        productsCount {
          count
        }
      }
    }
  }
`;

const GET_NODES_BY_IDS_QUERY = `#graphql
  query GetStoreNodesByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Collection {
        id
        title
        handle
      }
      ... on Page {
        id
        title
        handle
      }
    }
  }
`;

const GET_SHOP_ID_QUERY = `#graphql
  query GetShopMetafieldOwner {
    shop {
      id
    }
  }
`;

const SET_SHOP_METAFIELD_MUTATION = `#graphql
  mutation SyncStoreSettingMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_MAIN_THEME_EMBED_QUERY = `#graphql
  query GetMainThemeEmbedStatus {
    themes(roles: [MAIN], first: 1) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"]) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

export function toNumericId(gid) {
  if (typeof gid !== "string" || !gid) return "";
  const parts = gid.split("/");
  return parts[parts.length - 1] || "";
}

export function normalizeShop(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase().replace(/\/+$/, "");
}

export function getAppBaseUrl() {
  return (
    process.env.SHOPIFY_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  ).replace(/\/+$/, "");
}

export function serializeStoreSetting(record, shop = "") {
  const ringCollectionId = record?.ringCollectionId ?? "";
  const ringCollectionHandle = record?.ringCollectionHandle ?? "";
  return {
    shop: record?.shop ?? normalizeShop(shop),
    builderEnabled: record?.builderEnabled ?? true,
    ringCollectionId,
    ringCollectionNumericId:
      record?.ringCollectionNumericId ?? toNumericId(ringCollectionId),
    ringCollectionHandle,
    ringCollectionUrl: ringCollectionHandle
      ? `/collections/${ringCollectionHandle}`
      : "",
    ringCollectionTitle: record?.ringCollectionTitle ?? "",
    enabledCategories: normalizeEnabledCategories(record?.enabledCategories),
    pages:
      record?.pages && typeof record.pages === "object" ? record.pages : {},
    autoCreatePages: record?.autoCreatePages ?? true,
    pagesProvisionedAt: record?.pagesProvisionedAt?.toISOString?.() ?? null,
  };
}

/** Reads StoreSetting for one shop, returning safe defaults if not yet saved. */
export async function getStoreSetting(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return serializeStoreSetting(null, "");
  try {
    const record = await prisma.storeSetting.findUnique({
      where: { shop: domain },
    });
    return serializeStoreSetting(record, domain);
  } catch (error) {
    console.error("[store-setting] Failed to read StoreSetting:", error);
    return serializeStoreSetting(null, domain);
  }
}

/** Creates the initial StoreSetting row on install if absent (idempotent). */
export async function ensureStoreSetting(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return null;
  try {
    const record = await prisma.storeSetting.upsert({
      where: { shop: domain },
      update: {},
      create: {
        shop: domain,
        builderEnabled: true,
        autoCreatePages: true,
        pages: {},
      },
    });
    return serializeStoreSetting(record, domain);
  } catch (error) {
    console.error("[store-setting] Failed to ensure StoreSetting:", error);
    return null;
  }
}

/** Saves the primary Ring Collection (by ID), builderEnabled toggle, and visible categories. */
export async function upsertStoreSetting({
  shop,
  ringCollection,
  builderEnabled = true,
  enabledCategories,
}) {
  const domain = normalizeShop(shop);
  if (!domain) throw new Error("Missing shop domain.");

  const collectionId = ringCollection?.id || null;
  const data = {
    builderEnabled: Boolean(builderEnabled),
    ringCollectionId: collectionId,
    ringCollectionNumericId: collectionId ? toNumericId(collectionId) : null,
    ringCollectionHandle: ringCollection?.handle || null,
    ringCollectionTitle: ringCollection?.title || null,
  };
  if (enabledCategories && typeof enabledCategories === "object") {
    data.enabledCategories = normalizeEnabledCategories(enabledCategories);
  }

  const record = await prisma.storeSetting.upsert({
    where: { shop: domain },
    update: data,
    create: {
      shop: domain,
      autoCreatePages: true,
      pages: {},
      enabledCategories: normalizeEnabledCategories(enabledCategories),
      ...data,
    },
  });

  return serializeStoreSetting(record, domain);
}

/** Persists ID-mapped storefront pages (`{ natural: { id, numericId, title, url }, ... }`). */
export async function saveProvisionedPages(shop, pagesMap) {
  const domain = normalizeShop(shop);
  if (!domain) return null;
  try {
    const now = new Date();
    const record = await prisma.storeSetting.upsert({
      where: { shop: domain },
      update: { pages: pagesMap, pagesProvisionedAt: now },
      create: {
        shop: domain,
        builderEnabled: true,
        autoCreatePages: true,
        pages: pagesMap,
        pagesProvisionedAt: now,
      },
    });
    return serializeStoreSetting(record, domain);
  } catch (error) {
    console.error("[store-setting] Failed to save provisioned pages:", error);
    return null;
  }
}

/**
 * Refreshes live handles, titles, and URLs from Shopify strictly by stored
 * Page IDs and Ring Collection ID (so renamed slugs always stay accurate).
 */
export async function refreshStoreSettingFromShopify(admin, shop) {
  const current = await getStoreSetting(shop);
  if (!admin?.graphql) return current;

  const ids = [];
  if (current.ringCollectionId) ids.push(current.ringCollectionId);
  for (const entry of Object.values(current.pages || {})) {
    if (entry?.id) ids.push(entry.id);
  }
  if (!ids.length) return current;

  try {
    const res = await admin.graphql(GET_NODES_BY_IDS_QUERY, {
      variables: { ids },
    });
    const payload = await res.json();
    const nodes = payload?.data?.nodes ?? [];
    const byId = new Map(nodes.filter(Boolean).map((n) => [n.id, n]));

    let changed = false;
    const updateData = {};

    if (current.ringCollectionId) {
      const col = byId.get(current.ringCollectionId);
      if (
        col &&
        (col.handle !== current.ringCollectionHandle ||
          col.title !== current.ringCollectionTitle)
      ) {
        updateData.ringCollectionHandle = col.handle;
        updateData.ringCollectionTitle = col.title;
        changed = true;
      }
    }

    const nextPages = { ...(current.pages || {}) };
    for (const [key, entry] of Object.entries(nextPages)) {
      if (!entry?.id) continue;
      const node = byId.get(entry.id);
      if (node) {
        const nextUrl = `/pages/${node.handle}`;
        if (nextUrl !== entry.url || node.title !== entry.title) {
          nextPages[key] = {
            id: node.id,
            numericId: toNumericId(node.id),
            title: node.title,
            url: nextUrl,
          };
          changed = true;
        }
      }
    }
    if (changed) {
      updateData.pages = nextPages;
      const updated = await prisma.storeSetting.update({
        where: { shop: normalizeShop(shop) },
        data: updateData,
      });
      const serialized = serializeStoreSetting(updated, shop);
      await syncStoreSettingMetafield(admin, serialized);
      return serialized;
    }

    // Keep Shop Metafield appUrl aligned with active server / tunnel URL on Dashboard loads
    if (getAppBaseUrl()) {
      await syncStoreSettingMetafield(admin, current);
    }
  } catch (error) {
    console.error("[store-setting] Failed to refresh nodes by ID:", error);
  }

  return current;
}

/** Fetches all collections from the Shopify store (capped safely at 500). */
export async function fetchAllShopifyCollections(admin) {
  if (!admin?.graphql) return [];
  const all = [];
  let after = null;
  let pages = 0;

  try {
    while (pages < 5) {
      const response = await admin.graphql(GET_COLLECTIONS_QUERY, {
        variables: { first: 100, after },
      });
      const payload = await response.json();
      const connection = payload?.data?.collections;
      const nodes = connection?.nodes ?? [];

      for (const node of nodes) {
        all.push({
          id: node.id,
          numericId: toNumericId(node.id),
          title: node.title,
          handle: node.handle,
          url: `/collections/${node.handle}`,
          productsCount: node.productsCount?.count ?? 0,
        });
      }

      if (
        !connection?.pageInfo?.hasNextPage ||
        !connection?.pageInfo?.endCursor
      ) {
        break;
      }
      after = connection.pageInfo.endCursor;
      pages += 1;
    }
  } catch (error) {
    console.error(
      "[store-setting] Failed to fetch Shopify collections:",
      error,
    );
  }

  return all;
}

/**
 * Syncs ID-first StoreSetting JSON (including dynamic appUrl, Page IDs + live URLs,
 * and Ring Collection ID + live URL) into Shopify Shop Metafield `diamond_builder.store_setting`.
 */
export async function syncStoreSettingMetafield(admin, setting) {
  if (!admin?.graphql || !setting) {
    return { ok: false, error: "Missing admin client or setting" };
  }

  try {
    const shopRes = await admin.graphql(GET_SHOP_ID_QUERY);
    const shopData = await shopRes.json();
    const shopId = shopData?.data?.shop?.id;
    if (!shopId)
      return { ok: false, error: "Could not resolve Shopify Shop ID" };

    const value = JSON.stringify({
      appUrl: getAppBaseUrl(),
      builderEnabled: Boolean(setting.builderEnabled),
      ringCollectionId: setting.ringCollectionId || "",
      ringCollectionNumericId:
        setting.ringCollectionNumericId ||
        toNumericId(setting.ringCollectionId),
      ringCollectionHandle: setting.ringCollectionHandle || "",
      ringCollectionUrl: setting.ringCollectionUrl || "",
      ringCollectionTitle: setting.ringCollectionTitle || "",
      enabledCategories: normalizeEnabledCategories(setting.enabledCategories),
      pages: setting.pages || {},
    });

    const res = await admin.graphql(SET_SHOP_METAFIELD_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "diamond_builder",
            key: "store_setting",
            type: "json",
            value,
          },
        ],
      },
    });
    const payload = await res.json();
    const userErrors = payload?.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length) {
      return { ok: false, error: userErrors.map((e) => e.message).join(", ") };
    }
    return { ok: true };
  } catch (error) {
    console.error("[store-setting] Failed to sync shop metafield:", error);
    return { ok: false, error: error?.message || "Metafield sync failed" };
  }
}

/**
 * Resolves the merchant's primary public storefront origin (`https://domain`).
 */
export async function getStorefrontBaseUrl(shop) {
  const domain = normalizeShop(shop);
  if (!domain) return "";
  try {
    const profile = await prisma.shopProfile.findUnique({
      where: { shop: domain },
      select: { primaryDomain: true, primaryDomainHost: true },
    });
    if (profile?.primaryDomain && /^https?:\/\//i.test(profile.primaryDomain)) {
      return profile.primaryDomain.replace(/\/+$/, "");
    }
    const host = profile?.primaryDomainHost || domain;
    return `https://${host.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  } catch {
    return `https://${domain}`;
  }
}

/**
 * Checks whether the `dr-builder` App Embed block is active on the store's MAIN theme.
 * Strips Shopify's leading comment block in `config/settings_data.json` before parsing.
 */
export async function checkThemeEmbedStatus(admin) {
  if (!admin?.graphql) {
    return { checked: false, enabled: false, themeName: "" };
  }

  try {
    const res = await admin.graphql(GET_MAIN_THEME_EMBED_QUERY);
    const payload = await res.json();
    const theme = payload?.data?.themes?.nodes?.[0];
    if (!theme) {
      return { checked: false, enabled: false, themeName: "" };
    }

    const rawContent = theme?.files?.nodes?.[0]?.body?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      return {
        checked: true,
        enabled: false,
        themeName: theme.name || "Live Theme",
      };
    }

    // Shopify prefixes theme JSON files with a multiline /* ... */ auto-generated banner.
    const cleanJson = rawContent.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
    const parsed = JSON.parse(cleanJson);
    const blocks = parsed?.current?.blocks;
    if (!blocks || typeof blocks !== "object") {
      return {
        checked: true,
        enabled: false,
        themeName: theme.name || "Live Theme",
      };
    }

    const active = Object.values(blocks).some(
      (block) =>
        block &&
        typeof block.type === "string" &&
        block.type.toLowerCase().includes("dr-builder") &&
        block.disabled !== true,
    );

    return {
      checked: true,
      enabled: active,
      themeName: theme.name || "Live Theme",
    };
  } catch (error) {
    console.error("[store-setting] Could not check theme embed status:", error);
    return { checked: false, enabled: false, themeName: "" };
  }
}
