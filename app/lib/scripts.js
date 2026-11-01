// Server-authoritative script definitions for the Setup page.
//
// There is exactly ONE script the merchant installs: the storefront
// optimization script, copied and pasted into theme.liquid. It is generated
// here from environment configuration. No production script URL, app id or
// token is ever hardcoded: when the app owner has not configured a URL the
// script block contains an obvious PLACEHOLDER comment and an empty tag, so
// the app can never silently reference an invented endpoint.
//
// The script carries a stable, unique marker attribute. Verification
// (`app/lib/verify.js`) looks for that marker in the shop's served storefront
// HTML, so detection is presence-based and honest.

export const SCRIPT_KEYS = ["storefront-optimization"];

/**
 * Stable marker embedded in the script. This must be a unique string: the
 * verification step searches the storefront HTML for it.
 */
export const SCRIPT_MARKERS = {
  "storefront-optimization": "data-speed-scratcher-optimization",
};

/** Static metadata for the script (labels, step number, description). */
export const SCRIPT_META = {
  "storefront-optimization": {
    key: "storefront-optimization",
    step: 1,
    title: "Storefront Optimization Script",
    description:
      "Copy this script and paste it into your theme's theme.liquid file before the closing </head> tag, then verify your setup.",
    copyLabel: "Copy storefront optimization script",
    installHint: "Online Store → Themes → Edit code → theme.liquid, before </head>",
    envName: "SPEED_SCRATCHER_OPTIMIZATION_SCRIPT_URL",
  },
};

/** Returns meta for a script key, or `null` when the key is unknown. */
export function getScriptMeta(key) {
  return SCRIPT_META[key] ?? null;
}

/** Strict check for script keys coming from the client. */
export function isScriptKey(key) {
  return SCRIPT_KEYS.includes(key);
}

/**
 * Extracts the `src` URL from a rendered script block, or `""` when the block
 * has no source (the unconfigured placeholder). Verification uses this to
 * confirm the exact per-shop script is installed, not merely a tag that carries
 * the app marker.
 */
export function extractScriptSrc(script) {
  const match = /\ssrc="([^"]*)"/.exec(String(script ?? ""));
  return match ? match[1].trim() : "";
}

/** Escapes a value for safe use inside an HTML attribute's double quotes. */
function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Builds the raw storefront-optimization script HTML around an optional `src`
 * and extra attributes. With no `src` it emits an obvious PLACEHOLDER comment
 * and an empty tag, so the app can never silently reference an invented
 * endpoint.
 */
function buildOptimizationScript({ src = "", attributes = [] } = {}) {
  const meta = SCRIPT_META["storefront-optimization"];
  const marker = SCRIPT_MARKERS["storefront-optimization"];
  const extra = attributes.length ? ` ${attributes.join(" ")}` : "";
  const srcAttr = src ? ` src="${escapeAttribute(src)}"` : "";
  const placeholder = src
    ? ""
    : `<!-- PLACEHOLDER: set ${meta.envName} in the
     app's server environment and redeploy to generate the real script URL.
     Nothing loads until that is configured. -->
`;
  return `<!-- Diamond Builder - ${meta.title} -->
${placeholder}<script ${marker}${extra}${srcAttr} defer></script>`;
}

/**
 * Builds the single script definition around any copyable script text.
 *
 * @returns {{key:string, step:number, title:string, description:string,
 *   copyLabel:string, installHint:string, script:string}}
 */
export function buildScriptDefinition({ script }) {
  const meta = SCRIPT_META["storefront-optimization"];
  return {
    key: meta.key,
    step: meta.step,
    title: meta.title,
    description: meta.description,
    copyLabel: meta.copyLabel,
    installHint: meta.installHint,
    script,
  };
}

/**
 * Builds the single script definition from server configuration.
 *
 * @param {object} [config]
 * @param {string} [config.optimizationUrl] e.g. `https://…/optimization.js`
 * @returns {ReadonlyArray<{key:string, step:number, title:string,
 *   description:string, copyLabel:string, installHint:string, script:string}>}
 */
export function buildScriptDefinitions({ optimizationUrl = "" } = {}) {
  return [
    buildScriptDefinition({
      script: buildOptimizationScript({ src: optimizationUrl }),
    }),
  ];
}

/**
 * Serializable view of the scripts for the browser. The raw `script` text is
 * deliberately included — it is the exact text the merchant copies into their
 * theme — but it never contains secrets because the builder above never emits
 * them.
 */
export function getPublicScripts({ optimizationUrl = "" } = {}) {
  return buildScriptDefinitions({ optimizationUrl }).map((def) => ({
    key: def.key,
    step: def.step,
    title: def.title,
    description: def.description,
    copyLabel: def.copyLabel,
    installHint: def.installHint,
    script: def.script,
  }));
}