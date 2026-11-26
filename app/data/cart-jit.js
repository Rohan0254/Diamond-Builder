import prisma from "../db.server.js";
import { unauthenticated } from "../shopify.server.js";
import { getDiamondById } from "./diamonds.js";
import {
  getStoreSetting,
  getStorefrontBaseUrl,
  normalizeShop,
  toNumericId,
} from "./store-setting.js";

const GET_PRODUCT_BY_ID_QUERY = `#graphql
  query VerifyCachedDiamondProduct($id: ID!) {
    node(id: $id) {
      ... on Product {
        id
        handle
        status
        media(first: 1) {
          nodes {
            id
          }
        }
        variants(first: 1) {
          nodes {
            id
            price
            sku
          }
        }
      }
    }
  }
`;

const FIND_PRODUCT_BY_SKU_QUERY = `#graphql
  query FindDiamondProductBySku($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        status
        media(first: 1) {
          nodes {
            id
          }
        }
        variants(first: 1) {
          nodes {
            id
            price
            sku
          }
        }
      }
    }
  }
`;

const PRODUCT_SET_MUTATION = `#graphql
  mutation UpsertDiamondCartProduct($productSet: ProductSetInput!, $synchronous: Boolean!) {
    productSet(synchronous: $synchronous, input: $productSet) {
      product {
        id
        handle
        status
        variants(first: 1) {
          nodes {
            id
            price
            sku
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_PUBLICATIONS_QUERY = `#graphql
  query ListOnlineStorePublications {
    publications(first: 15) {
      nodes {
        id
        name
        supportsFuturePublishing
      }
    }
  }
`;

const PUBLISH_PRODUCT_MUTATION = `#graphql
  mutation PublishDiamondProduct($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        availablePublicationsCount {
          count
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function escHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidHttpsImage(url) {
  return typeof url === "string" && /^https:\/\/[^\s]+/i.test(url.trim());
}

function buildDiamondDetailUrl(storeBaseUrl, storeSetting, diamondId, clientDetailUrl) {
  const detailPath = storeSetting?.pages?.detail?.url || "";
  if (detailPath && storeBaseUrl) {
    const sep = detailPath.includes("?") ? "&" : "?";
    return `${storeBaseUrl}${detailPath}${sep}pid=${encodeURIComponent(diamondId)}`;
  }
  if (clientDetailUrl && /^https?:\/\//i.test(clientDetailUrl)) {
    return clientDetailUrl;
  }
  return clientDetailUrl || "";
}

function buildDiamondDescriptionHtml({ diamond, sku, detailUrl, ringMappingId, ringTitle }) {
  const rows = [
    ["SKU", sku],
    ["Shape", diamond.shape],
    ["Carats", diamond.carats != null ? `${diamond.carats} ct` : ""],
    ["Color", diamond.colore],
    ["Clarity", diamond.clarity],
    ["Cut", diamond.cut],
    ["Polish / Symmetry", [diamond.pol, diamond.symm].filter(Boolean).join(" / ")],
    ["Fluorescence", diamond.flo],
    ["Measurements", diamond.measurement],
    ["Certificate", [diamond.certificate, diamond.ReportNo].filter(Boolean).join(" #")],
    ["Paired Ring", ringTitle ? `${ringTitle}${ringMappingId ? ` (${ringMappingId})` : ""}` : ringMappingId],
  ]
    .filter((row) => Boolean(row[1]))
    .map(([k, v]) => `<li><strong>${escHtml(k)}:</strong> ${escHtml(v)}</li>`)
    .join("");

  const detailLinkHtml = detailUrl
    ? `<p><a href="${escHtml(detailUrl)}" target="_blank" rel="noopener noreferrer">View Diamond Details Page</a></p>`
    : "";

  return `<p>Custom center diamond mapped via <strong>Diamond Builder By WS</strong>.</p><ul>${rows}</ul>${detailLinkHtml}`;
}

async function publishToOnlineStore(admin, productId) {
  try {
    const pubRes = await admin.graphql(LIST_PUBLICATIONS_QUERY);
    const pubData = await pubRes.json();
    const nodes = pubData?.data?.publications?.nodes ?? [];
    if (!nodes.length) return { ok: false, error: "No sales channel publications found." };

    const onlineStorePubs = nodes.filter(
      (n) => /online store/i.test(n.name || "") || n.supportsFuturePublishing,
    );
    const targets = onlineStorePubs.length ? onlineStorePubs : [nodes[0]];

    const mutRes = await admin.graphql(PUBLISH_PRODUCT_MUTATION, {
      variables: {
        id: productId,
        input: targets.map((p) => ({ publicationId: p.id })),
      },
    });
    const mutData = await mutRes.json();
    const userErrors = mutData?.data?.publishablePublish?.userErrors ?? [];
    if (userErrors.length) {
      return { ok: false, error: userErrors.map((e) => e.message).join(", ") };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Failed to publish product" };
  }
}

async function upsertDiamondProductMap({
  shop,
  diamondId,
  sku,
  shopifyProductId,
  shopifyVariantId,
  productHandle,
  lastPrice,
  ringMappingId,
}) {
  if (!prisma?.shopifyDiamondMap) return;
  try {
    await prisma.shopifyDiamondMap.upsert({
      where: { shop_diamondId: { shop, diamondId } },
      create: {
        shop,
        diamondId,
        sku,
        shopifyProductId,
        shopifyVariantId,
        productHandle: productHandle || null,
        lastPrice,
        ringMappingId: ringMappingId || null,
      },
      update: {
        sku,
        shopifyProductId,
        shopifyVariantId,
        productHandle: productHandle || null,
        lastPrice,
        ringMappingId: ringMappingId || null,
      },
    });
  } catch (error) {
    console.warn("[cart-jit] Failed to persist ShopifyDiamondMap:", error?.message);
  }
}

/**
 * Re-verifies active diamond stock & price in MongoDB, reuses our Mongo-cached
 * mapping or creates/updates a dedicated Shopify product for THAT diamond (with
 * SKU, Ring Mapping ID, Price, Image, Description & Diamond Detail Page Link),
 * publishes it to Online Store, and returns `diamondVariantNumericId` + `notNew`
 * ready for `POST /cart/add.js`.
 */
export async function prepareDiamondCartItem({
  shop,
  diamondId,
  ringProductId = "",
  ringVariantId = "",
  ringTitle = "",
  detailPageUrl = "",
  bundleId = "",
}) {
  const domain = normalizeShop(shop);
  const cleanDiamondId = String(diamondId || "").trim();
  if (!domain) {
    return { ok: false, status: 400, error: "Missing shop domain." };
  }
  if (!cleanDiamondId) {
    return { ok: false, status: 400, error: "Missing diamondId." };
  }

  const [storeSetting, storeBaseUrl, diamond, cachedMap] = await Promise.all([
    getStoreSetting(domain),
    getStorefrontBaseUrl(domain),
    getDiamondById(cleanDiamondId),
    prisma?.shopifyDiamondMap && /^[a-f0-9]{24}$/i.test(cleanDiamondId)
      ? prisma.shopifyDiamondMap.findUnique({
          where: { shop_diamondId: { shop: domain, diamondId: cleanDiamondId } },
          select: {
            shopifyProductId: true,
            shopifyVariantId: true,
            productHandle: true,
            lastPrice: true,
            ringMappingId: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (storeSetting?.builderEnabled === false) {
    return { ok: false, status: 403, error: "Diamond Builder is disabled for this store." };
  }
  if (!diamond) {
    return {
      ok: false,
      status: 404,
      error: "Selected diamond is no longer available.",
    };
  }

  const sku = String(diamond.stockId || `WSC-DIA-${diamond.id}`).trim();
  const authoritativePrice = Number(diamond.price || 0);
  const priceStr = authoritativePrice.toFixed(2);
  const ringMappingNumericId = toNumericId(String(ringProductId || "")) || String(ringProductId || "").trim();
  const resolvedDetailUrl = buildDiamondDetailUrl(
    storeBaseUrl,
    storeSetting,
    diamond.id,
    detailPageUrl,
  );

  let admin;
  try {
    const ctx = await unauthenticated.admin(domain);
    admin = ctx.admin;
  } catch (error) {
    console.warn("[cart-jit] Offline session unavailable, falling back to properties:", error?.message);
    return {
      ok: true,
      mode: "properties_only",
      diamondVariantNumericId: null,
      sku,
      detailUrl: resolvedDetailUrl,
      ringMappingId: ringMappingNumericId,
      diamond,
    };
  }

  try {
    // 1. O(1) Mongo-first verification -> fallback SKU search only on cache miss
    let existingProduct = null;
    let verifiedFromCache = false;
    if (cachedMap?.shopifyProductId) {
      try {
        const nodeRes = await admin.graphql(GET_PRODUCT_BY_ID_QUERY, {
          variables: { id: cachedMap.shopifyProductId },
        });
        const nodeJson = await nodeRes.json();
        const nodeProduct = nodeJson?.data?.node;
        if (nodeProduct?.id && nodeProduct?.variants?.nodes?.[0]?.id) {
          existingProduct = nodeProduct;
          verifiedFromCache = true;
        }
      } catch {
        existingProduct = null;
      }
    }

    if (!existingProduct) {
      const existingRes = await admin.graphql(FIND_PRODUCT_BY_SKU_QUERY, {
        variables: { query: `sku:${sku}` },
      });
      const existingJson = await existingRes.json();
      existingProduct = existingJson?.data?.products?.nodes?.[0] || null;
    }

    const existingVariant = existingProduct?.variants?.nodes?.[0] || null;
    const existingVariantId = existingVariant?.id || null;
    const isArchived = existingProduct?.status === "ARCHIVED";

    // Fast path: cached, published, live, price & ring mapping unchanged -> skip mutations
    const existingPriceDiffers =
      !existingVariant ||
      Math.abs(Number(existingVariant.price || 0) - authoritativePrice) > 0.005;
    const ringMappingDiffers =
      String(cachedMap?.ringMappingId || "") !== String(ringMappingNumericId || "");

    if (
      verifiedFromCache &&
      existingProduct?.id &&
      existingVariantId &&
      !isArchived &&
      !existingPriceDiffers &&
      !ringMappingDiffers
    ) {
      return {
        ok: true,
        notNew: true,
        mode: "paired_variants",
        diamondProductId: existingProduct.id,
        diamondProductNumericId: toNumericId(existingProduct.id),
        diamondProductHandle: existingProduct.handle,
        diamondVariantId: existingVariantId,
        diamondVariantNumericId: Number(toNumericId(existingVariantId)),
        sku,
        price: authoritativePrice,
        image: diamond.image || "",
        detailUrl: resolvedDetailUrl,
        ringMappingId: ringMappingNumericId,
        diamond,
      };
    }

    const tags = ["diamond-builder-feed", "byor-diamond"];
    if (ringMappingNumericId) tags.push(`ring-map-${ringMappingNumericId}`);

    const metafields = [
      {
        namespace: "diamond_builder",
        key: "diamond_id",
        type: "single_line_text_field",
        value: String(diamond.id),
      },
      {
        namespace: "diamond_builder",
        key: "sku",
        type: "single_line_text_field",
        value: sku,
      },
      {
        namespace: "diamond_builder",
        key: "bundle_json",
        type: "json",
        value: JSON.stringify({
          diamondId: String(diamond.id),
          sku,
          price: authoritativePrice,
          image: diamond.image || "",
          detailUrl: resolvedDetailUrl,
          ringMappingId: ringMappingNumericId,
          ringVariantId: String(ringVariantId || ""),
          ringTitle: String(ringTitle || ""),
          bundleId: String(bundleId || ""),
        }),
      },
    ];

    if (ringMappingNumericId) {
      metafields.push({
        namespace: "diamond_builder",
        key: "ring_mapping_id",
        type: "single_line_text_field",
        value: String(ringMappingNumericId),
      });
    }
    if (resolvedDetailUrl) {
      metafields.push({
        namespace: "diamond_builder",
        key: "detail_url",
        type: "single_line_text_field",
        value: String(resolvedDetailUrl),
      });
    }

    const descriptionHtml = buildDiamondDescriptionHtml({
      diamond,
      sku,
      detailUrl: resolvedDetailUrl,
      ringMappingId: ringMappingNumericId,
      ringTitle: String(ringTitle || ""),
    });

    const buildInput = (status, includeFiles) => ({
      ...(existingProduct?.id ? { id: existingProduct.id } : {}),
      title:
        diamond.title ||
        `${diamond.carats || ""}ct ${diamond.shape || "Natural"} Diamond`.trim(),
      descriptionHtml,
      vendor: "Diamond Builder By WS",
      productType: diamond.category || "Custom Center Diamond",
      status,
      tags,
      metafields,
      productOptions: [
        {
          name: "Title",
          position: 1,
          values: [{ name: "Default Title" }],
        },
      ],
      variants: [
        {
          ...(existingVariantId ? { id: existingVariantId } : {}),
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price: priceStr,
          sku,
          inventoryPolicy: "CONTINUE",
        },
      ],
      ...(includeFiles && isValidHttpsImage(diamond.image)
        ? {
            files: [
              {
                originalSource: diamond.image.trim(),
                contentType: "IMAGE",
                alt: diamond.title || "Diamond",
              },
            ],
          }
        : {}),
    });

    // Only upload image media when creating a product or when an existing product has none.
    const existingHasMedia = Boolean(existingProduct?.media?.nodes?.length);
    const shouldUploadImage = isValidHttpsImage(diamond.image) && !existingHasMedia;
    let setRes = await admin.graphql(PRODUCT_SET_MUTATION, {
      variables: { productSet: buildInput("UNLISTED", shouldUploadImage), synchronous: true },
    });
    let setJson = await setRes.json();
    let userErrors = setJson?.data?.productSet?.userErrors ?? [];

    // Retry without external image if host fails Shopify media ingestion
    if (userErrors.length && shouldUploadImage) {
      setRes = await admin.graphql(PRODUCT_SET_MUTATION, {
        variables: { productSet: buildInput("UNLISTED", false), synchronous: true },
      });
      setJson = await setRes.json();
      userErrors = setJson?.data?.productSet?.userErrors ?? [];
    }

    // Fallback to ACTIVE status if store/API plan rejects UNLISTED
    if (userErrors.length) {
      setRes = await admin.graphql(PRODUCT_SET_MUTATION, {
        variables: { productSet: buildInput("ACTIVE", false), synchronous: true },
      });
      setJson = await setRes.json();
      userErrors = setJson?.data?.productSet?.userErrors ?? [];
    }

    const createdProduct = setJson?.data?.productSet?.product;
    const variant = createdProduct?.variants?.nodes?.[0];

    if (userErrors.length || !createdProduct?.id || !variant?.id) {
      return {
        ok: true,
        mode: "properties_only",
        warning:
          userErrors.map((e) => e.message).join(", ") ||
          "Could not create diamond product",
        diamondVariantNumericId: null,
        sku,
        detailUrl: resolvedDetailUrl,
        ringMappingId: ringMappingNumericId,
        diamond,
      };
    }

    const needsPublish = !verifiedFromCache || isArchived;
    if (needsPublish) {
      const pub = await publishToOnlineStore(admin, createdProduct.id);
      if (!pub.ok) {
        return {
          ok: true,
          mode: "properties_only",
          warning: pub.error,
          diamondVariantNumericId: null,
          sku,
          detailUrl: resolvedDetailUrl,
          ringMappingId: ringMappingNumericId,
          diamond,
        };
      }
    }

    await upsertDiamondProductMap({
      shop: domain,
      diamondId: String(diamond.id),
      sku,
      shopifyProductId: createdProduct.id,
      shopifyVariantId: variant.id,
      productHandle: createdProduct.handle,
      lastPrice: authoritativePrice,
      ringMappingId: ringMappingNumericId,
    });

    const isFreshlyAvailable = !existingProduct?.id || isArchived;
    return {
      ok: true,
      notNew: !isFreshlyAvailable,
      mode: "paired_variants",
      diamondProductId: createdProduct.id,
      diamondProductNumericId: toNumericId(createdProduct.id),
      diamondProductHandle: createdProduct.handle,
      diamondVariantId: variant.id,
      diamondVariantNumericId: Number(toNumericId(variant.id)),
      sku,
      price: authoritativePrice,
      image: diamond.image || "",
      detailUrl: resolvedDetailUrl,
      ringMappingId: ringMappingNumericId,
      diamond,
    };
  } catch (error) {
    console.warn("[cart-jit] Failed to create diamond product:", error?.message);
    return {
      ok: true,
      mode: "properties_only",
      warning: error?.message || "Fallback to line-item properties",
      diamondVariantNumericId: null,
      sku,
      detailUrl: resolvedDetailUrl,
      ringMappingId: ringMappingNumericId,
      diamond,
    };
  }
}
