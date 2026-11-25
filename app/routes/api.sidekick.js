import { authenticateAdminOrDiagnose } from "../shopify.server.js";
import { getDiamondSummaryCounts, queryDiamonds } from "../data/diamonds.js";
import { BUILDER_PAGE_DEFS } from "../data/shopify-pages.js";
import {
  checkThemeEmbedStatus,
  getStoreSetting,
  getStorefrontBaseUrl,
} from "../data/store-setting.js";

const ALLOWED_EXTENSION_ORIGINS = new Set([
  "https://extensions.shopifycdn.com",
  "https://admin.shopify.com",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_EXTENSION_ORIGINS.has(origin)
    ? origin
    : "https://extensions.shopifycdn.com";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function respondJson(request, payload, status = 200, shopifyCors) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request),
  });
  return typeof shopifyCors === "function" ? shopifyCors(response) : response;
}

function buildLivePages(setting, baseUrl) {
  const stored = setting?.pages || {};
  return BUILDER_PAGE_DEFS.map((def) => {
    const path = stored[def.key]?.url || "";
    return {
      key: def.key,
      label: def.initialTitle,
      liveUrl: path && baseUrl ? `${baseUrl}${path}` : path || null,
    };
  });
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const auth = await authenticateAdminOrDiagnose(request, "api.sidekick");
  if (!auth.ok) {
    return respondJson(request, { ok: false, error: auth.error }, 401);
  }

  const { admin, session, cors } = auth.context;
  const params = new URL(request.url).searchParams;
  const action = (params.get("action") || "status").trim().toLowerCase();

  try {
    if (action === "search_diamonds") {
      const limit = Math.min(10, Math.max(1, Number(params.get("limit")) || 6));
      const [setting, baseUrl, result] = await Promise.all([
        getStoreSetting(session.shop),
        getStorefrontBaseUrl(session.shop),
        queryDiamonds({
          pageType: (params.get("category") || params.get("type") || "natural")
            .trim()
            .toLowerCase(),
          shape: (params.get("shape") || "").trim(),
          cut: (params.get("cut") || "").trim(),
          color: (params.get("color") || "").trim(),
          clarity: (params.get("clarity") || "").trim(),
          certificate: (params.get("certificate") || "").trim(),
          minPrice: Number(params.get("minPrice")) || 0,
          maxPrice: Number(params.get("maxPrice")) || 0,
          minCarat: Number(params.get("minCarat")) || 0,
          maxCarat: Number(params.get("maxCarat")) || 0,
          sort: (params.get("sort") || "price_asc").trim(),
          page: Number(params.get("page")) || 1,
          pageSize: limit,
        }),
      ]);

      const detailPath = setting?.pages?.detail?.url || "";
      const diamonds = result.diamonds.map((d) => ({
        title: d.title,
        stockNumber: d.stockId || d.ReportNo || "",
        category: d.category,
        shape: d.shape,
        carat: d.carats,
        color: d.colore,
        clarity: d.clarity,
        cut: d.cut,
        certificate: d.certificate,
        priceUsd: d.price,
        liveUrl:
          detailPath && baseUrl
            ? `${baseUrl}${detailPath}?diamond=${encodeURIComponent(d.id)}`
            : null,
      }));

      return respondJson(
        request,
        {
          ok: true,
          totalMatches: result.totalCount,
          returned: diamonds.length,
          diamonds,
        },
        200,
        cors,
      );
    }

    const [setting, embedStatus, counts, baseUrl] = await Promise.all([
      getStoreSetting(session.shop),
      checkThemeEmbedStatus(admin),
      getDiamondSummaryCounts(),
      getStorefrontBaseUrl(session.shop),
    ]);

    const ringCollectionLiveUrl =
      setting.ringCollectionUrl && baseUrl
        ? `${baseUrl}${setting.ringCollectionUrl}`
        : null;

    return respondJson(
      request,
      {
        ok: true,
        onboardingComplete: Boolean(embedStatus.enabled && setting.ringCollectionTitle),
        step1ThemeEmbed: {
          enabled: embedStatus.enabled,
          checked: embedStatus.checked,
          themeName: embedStatus.themeName || null,
          themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
        },
        step2RingCollection: {
          selected: Boolean(setting.ringCollectionTitle),
          collectionTitle: setting.ringCollectionTitle || null,
          builderEnabled: Boolean(setting.builderEnabled),
          visibleCategories: setting.enabledCategories,
          liveUrl: ringCollectionLiveUrl,
        },
        inventoryCounts: counts,
        liveStorefrontPages: buildLivePages(setting, baseUrl),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("[api.sidekick] Request failed:", error);
    return respondJson(
      request,
      { ok: false, error: "Unable to load Diamond Builder data." },
      500,
      cors,
    );
  }
}
