import {
  getStoreSetting,
  saveProvisionedPages,
  syncStoreSettingMetafield,
  toNumericId,
} from "./store-setting.js";

const GET_PAGES_QUERY = `#graphql
  query GetStorePages {
    pages(first: 100) {
      nodes {
        id
        title
        handle
        body
      }
    }
  }
`;

const CREATE_PAGE_MUTATION = `#graphql
  mutation CreateStorePage($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_PAGE_MUTATION = `#graphql
  mutation UpdateStorePage($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Initial defaults used ONLY when creating a page for the very first time.
 * Once created, pages are tracked, matched, and navigated strictly by Shopify Page ID.
 */
export const BUILDER_PAGE_DEFS = [
  {
    key: "natural",
    initialTitle: "Natural Diamonds",
    initialHandle: "natural-diamonds",
    legacyHandles: ["natural-diamond"],
    body: `<div id="diamond-builder-root" class="wsc-builder-mount" data-wsc-page="natural" data-wsc-category="Natural"></div>`,
  },
  {
    key: "lab",
    initialTitle: "Lab Grown Diamonds",
    initialHandle: "lab-grown-diamonds",
    legacyHandles: ["lab-diamonds", "lab-grown"],
    body: `<div id="diamond-builder-root" class="wsc-builder-mount" data-wsc-page="lab" data-wsc-category="Lab Grown Natural"></div>`,
  },
  {
    key: "gemstones",
    initialTitle: "Gemstones",
    initialHandle: "gemstones",
    legacyHandles: ["gemstone", "gemstone-diamonds"],
    body: `<div id="diamond-builder-root" class="wsc-builder-mount" data-wsc-page="gemstones" data-wsc-category="Gemstones"></div>`,
  },
  {
    key: "colored",
    initialTitle: "Colored Diamonds",
    initialHandle: "colored-diamonds",
    legacyHandles: ["color-diamonds", "colored-diamond"],
    body: `<div id="diamond-builder-root" class="wsc-builder-mount" data-wsc-page="colored" data-wsc-category="Colored Diamonds"></div>`,
  },
  {
    key: "detail",
    initialTitle: "Diamond Details",
    initialHandle: "diamond-details",
    legacyHandles: ["diamond-detail"],
    body: `<div id="diamond-builder-root" class="wsc-builder-mount" data-wsc-page="detail"></div>`,
  },
];

/**
 * Ensures the 5 Diamond Builder pages exist on the merchant store and stores
 * their permanent Shopify Page IDs (`id`, `numericId`, `title`, live `url`)
 * in `StoreSetting.pages` + the `diamond_builder.store_setting` Shop Metafield.
 *
 * Matching order:
 *   1. Stored Shopify Page ID from `StoreSetting.pages[key].id` (resists handle renames!)
 *   2. Initial handle match (for pre-existing stores before ID tracking)
 *   3. Create new page via `pageCreate`
 */
export async function ensureBuilderPages({ admin, shop = "", repair = false } = {}) {
  const result = { created: [], updated: [], existing: [], errors: [], pages: {} };
  if (!admin?.graphql) return result;

  try {
    const [res, currentSetting] = await Promise.all([
      admin.graphql(GET_PAGES_QUERY),
      shop ? getStoreSetting(shop) : Promise.resolve(null),
    ]);

    const data = await res.json();
    const existingNodes = data?.data?.pages?.nodes ?? [];
    const byId = new Map(existingNodes.map((node) => [node.id, node]));
    const byHandle = new Map(
      existingNodes.map((node) => [(node.handle || "").toLowerCase(), node]),
    );
    const storedPages = currentSetting?.pages || {};
    const resolvedPages = {};

    for (const def of BUILDER_PAGE_DEFS) {
      const storedEntry = storedPages[def.key];
      const existingByAlias = (def.legacyHandles || [])
        .map((h) => byHandle.get(h.toLowerCase()))
        .find(Boolean);
      const existing =
        (storedEntry?.id && byId.get(storedEntry.id)) ||
        byHandle.get(def.initialHandle.toLowerCase()) ||
        existingByAlias;

      if (existing) {
        const needsRepair =
          !existing.body ||
          !existing.body.includes("wsc-builder-mount") ||
          (repair && existing.body.trim() !== def.body.trim());

        let pageNode = existing;
        if (needsRepair) {
          const updateRes = await admin.graphql(UPDATE_PAGE_MUTATION, {
            variables: {
              id: existing.id,
              page: { body: def.body, isPublished: true },
            },
          });
          const updateData = await updateRes.json();
          const userErrors = updateData?.data?.pageUpdate?.userErrors ?? [];
          if (userErrors.length) {
            result.errors.push(`${def.key}: ${userErrors.map((e) => e.message).join(", ")}`);
          } else {
            pageNode = updateData?.data?.pageUpdate?.page || existing;
            result.updated.push(pageNode.id);
          }
        } else {
          result.existing.push(existing.id);
        }

        resolvedPages[def.key] = {
          id: pageNode.id,
          numericId: toNumericId(pageNode.id),
          title: pageNode.title,
          url: `/pages/${pageNode.handle}`,
        };
        continue;
      }

      const createRes = await admin.graphql(CREATE_PAGE_MUTATION, {
        variables: {
          page: {
            title: def.initialTitle,
            handle: def.initialHandle,
            body: def.body,
            isPublished: true,
          },
        },
      });
      const createData = await createRes.json();
      const userErrors = createData?.data?.pageCreate?.userErrors ?? [];
      const createdPage = createData?.data?.pageCreate?.page;

      if (userErrors.length || !createdPage) {
        result.errors.push(
          `${def.key}: ${userErrors.map((e) => e.message).join(", ") || "Create failed"}`,
        );
      } else {
        result.created.push(createdPage.id);
        resolvedPages[def.key] = {
          id: createdPage.id,
          numericId: toNumericId(createdPage.id),
          title: createdPage.title,
          url: `/pages/${createdPage.handle}`,
        };
      }
    }

    result.pages = resolvedPages;

    if (shop && Object.keys(resolvedPages).length > 0) {
      const updatedSetting = await saveProvisionedPages(shop, resolvedPages);
      if (updatedSetting) {
        await syncStoreSettingMetafield(admin, updatedSetting);
      }
    }
  } catch (error) {
    console.error("[shopify-pages] Failed to ensure builder pages:", error);
    result.errors.push(error?.message || String(error));
  }

  return result;
}
