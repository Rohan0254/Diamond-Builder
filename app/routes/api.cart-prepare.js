import { prepareDiamondCartItem } from "../data/cart-jit.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return json({ ok: false, error: "Method not allowed. Use POST." }, 405);
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  const shop = String(body?.shop || "").trim();
  const diamondId = String(body?.diamondId || "").trim();
  if (!shop || !diamondId) {
    return json({ ok: false, error: "Missing shop or diamondId." }, 400);
  }

  try {
    const result = await prepareDiamondCartItem({
      shop,
      diamondId,
      ringProductId: String(body?.ringProductId || "").trim(),
      ringVariantId: String(body?.ringVariantId || "").trim(),
      ringTitle: String(body?.ringTitle || "").trim(),
      detailPageUrl: String(body?.detailPageUrl || "").trim(),
      bundleId: String(body?.bundleId || "").trim(),
    });
    return json(result, result.ok ? 200 : result.status || 400);
  } catch (error) {
    console.error("[api.cart-prepare] Failed:", error);
    return json({ ok: false, error: "Unable to prepare diamond for cart." }, 500);
  }
}
