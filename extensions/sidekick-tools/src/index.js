function buildSearchParams(params = {}) {
  const query = new URLSearchParams({ action: "search_diamonds" });
  const keys = [
    "category",
    "shape",
    "cut",
    "color",
    "clarity",
    "certificate",
    "minCarat",
    "maxCarat",
    "minPrice",
    "maxPrice",
    "sort",
    "limit",
  ];

  for (const key of keys) {
    const val = params[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      query.set(key, String(val).trim());
    }
  }
  return query.toString();
}

async function callSidekickApi(path) {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error || `Request failed with status ${response.status}`,
    };
  }
  return data;
}

export default () => {
  shopify.tools.register("get_diamond_builder_status", async () => {
    try {
      return await callSidekickApi("/api/sidekick?action=status");
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Unable to fetch Diamond Builder status.",
      };
    }
  });

  shopify.tools.register("search_diamonds", async (params) => {
    try {
      const qs = buildSearchParams(params);
      return await callSidekickApi(`/api/sidekick?${qs}`);
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Unable to search Diamond Builder catalog.",
      };
    }
  });
};
