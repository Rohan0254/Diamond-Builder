// Pure helpers for the per-shop script template stored in the `Script`
// collection.
//
// A `Script` row has one JSON column per platform (`shopify`, `wix`,
// `bigcommerce`, `webflow`, `custom`, `blank`) plus `default`; each column holds
// that platform's script body with `{{PLACEHOLDER}}` tokens. These helpers pick
// the right column (falling back to `default`), substitute the tokens and
// derive the values from a `ShopProfile`.
//
// No I/O happens here, so the tricky parts (platform selection, the string/JSON
// shapes a hand-edited row can take, placeholder substitution) are unit-testable
// without a database.

/** Platform columns on the `Script` model (Bunny/PHP named them the same). */
export const SCRIPT_PLATFORMS = [
  "shopify",
  "wix",
  "bigcommerce",
  "webflow",
  "custom",
  "blank",
];

/** Placeholders substituted in a template before it is uploaded. */
export const SCRIPT_PLACEHOLDERS = [
  "USER_ID",
  "PLATFORM",
  "WEBSITE_ID",
  "WEBSITE_URL",
  "DOMAIN",
];

/**
 * Normalizes a platform name to a `Script` column key. Unknown values fall back
 * to `custom` so a template is still found via `default`.
 */
export function normalizeScriptPlatform(platform) {
  const key = String(platform ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return SCRIPT_PLATFORMS.includes(key) ? key : "custom";
}

/**
 * Extracts the template text from a `Script` JSON column. A column may be a
 * plain string or an object (`{ code }`, `{ script }`, `{ template }`,
 * `{ content }`, `{ value }`), so both shapes a hand-edited row can take work.
 */
export function templateContent(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const field of ["code", "script", "template", "content", "value"]) {
      const candidate = value[field];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return "";
}

/**
 * Picks the template for a platform, falling back to the `default` column.
 * Returns `{ content, source }`; `content` is "" when nothing is configured.
 */
export function pickScriptTemplate(record, platform) {
  if (!record || typeof record !== "object") {
    return { content: "", source: null };
  }
  const key = normalizeScriptPlatform(platform);
  const platformContent = templateContent(record[key]).trim();
  if (platformContent) return { content: platformContent, source: key };
  const fallback = templateContent(record.default).trim();
  if (fallback) return { content: fallback, source: "default" };
  return { content: "", source: null };
}

/** Best-effort host extraction from a URL ("" when it cannot be parsed). */
export function hostFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Builds the placeholder values for a store. `userId` and `websiteId` are the
 * store's Mongo `_id` (the app has one store per `ShopProfile`), and `DOMAIN`
 * comes from the primary domain when available.
 */
export function buildScriptVariables({
  userId,
  platform = "Shopify",
  websiteId,
  websiteUrl,
  domain,
} = {}) {
  return {
    USER_ID: String(userId ?? ""),
    PLATFORM: String(platform ?? ""),
    WEBSITE_ID: String(websiteId ?? ""),
    WEBSITE_URL: String(websiteUrl ?? ""),
    DOMAIN: domain || hostFromUrl(websiteUrl) || "",
  };
}

/**
 * Replaces every `{{NAME}}` token with its value. Unknown tokens are blanked
 * rather than left in place: a stray `{{...}}` in an uploaded script would be a
 * JavaScript syntax error.
 */
export function applyScriptPlaceholders(template, variables = {}) {
  let output = String(template ?? "");
  for (const name of SCRIPT_PLACEHOLDERS) {
    output = output.split(`{{${name}}}`).join(String(variables[name] ?? ""));
  }
  return output.replace(/\{\{[^}]*\}\}/g, "");
}
