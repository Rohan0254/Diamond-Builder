import { getDiamondById, queryDiamonds } from "../data/diamonds.js";
import { getStoreSetting } from "../data/store-setting.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  const params = new URL(request.url).searchParams;
  const id = (params.get("id") || "").trim();

  try {
    if (id) {
      const diamond = await getDiamondById(id);
      if (!diamond) return json({ ok: false, error: "Diamond not found" }, 404);
      return json({ ok: true, diamond });
    }

    const shop = (params.get("shop") || "").trim();
    const pageType = (params.get("type") || "").trim().toLowerCase();

    if (shop && pageType && ["natural", "lab", "gemstones", "colored"].includes(pageType)) {
      const storeSetting = await getStoreSetting(shop);
      if (storeSetting?.enabledCategories?.[pageType] === false) {
        return json({ ok: true, diamonds: [], totalCount: 0, disabled: true });
      }
    }

    const result = await queryDiamonds({
      pageType,
      category: (params.get("category") || "").trim(),
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
      pageSize: Number(params.get("limit")) || 12,
    });

    return json({ ok: true, ...result });
  } catch (error) {
    console.error("[api.diamonds] Failed to load diamonds:", error);
    return json({ ok: false, error: "Unable to load diamonds", diamonds: [], totalCount: 0 }, 500);
  }
}
