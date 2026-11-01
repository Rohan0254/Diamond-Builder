// Pure verification logic for the Setup page.
//
// Verification is presence-based: each script carries a stable marker
// (`SCRIPT_MARKERS` in `app/lib/scripts.js`), and we search for it in two
// independent sources — the live theme's files (read through the Admin API)
// and the shop's served storefront HTML. This module contains only
// deterministic helpers so the tricky parts (per-script results, overall
// status, password page detection, message text) are unit testable without the
// network. The theme read and storefront fetch themselves live in
// `app/setup.server.js`.

/** Per-script verification statuses. */
export const VERIFY_STATUS = {
  VERIFIED: "verified",
  MISPLACED: "misplaced",
  NOT_DETECTED: "not-detected",
  UNABLE: "unable-to-verify",
};

/** Overall setup statuses persisted with each verification record. */
export const OVERALL_STATUS = {
  COMPLETE: "complete",
  INCOMPLETE: "incomplete",
  UNKNOWN: "unknown",
};

const PASSWORD_PAGE_PATTERN =
  /shopify-password-form|shopify-password-page|id=["']password_form["']/i;

/**
 * Detects a Shopify storefront password page. Dev stores are often
 * password-protected; verifying against the password page would report "not
 * detected" and falsely blame the merchant, so we treat it as unable-to-verify.
 */
export function detectPasswordPage(html) {
  if (typeof html !== "string") return false;
  return PASSWORD_PAGE_PATTERN.test(html);
}

/** Whether a status represents a successful per-script verification. */
export function isVerifiedStatus(status) {
  return status === VERIFY_STATUS.VERIFIED;
}

/**
 * Classifies where a script marker sits relative to the document `<head>`.
 *
 * Storefront optimization scripts must be loaded in `<head>` (before
 * `</head>`) so they run early; a script pasted into the `<body>` is installed
 * in the wrong place. Parsing is deliberately tolerant: tags are matched
 * case-insensitively and the marker may sit anywhere inside the head region.
 *
 * @returns {"head"|"body"|"unknown"}
 *   `"head"` when the marker is inside a `<head>...</head>` region, `"body"`
 *   when the document clearly has head/body structure but the marker is not in
 *   the head, and `"unknown"` when the content has no marker or no head/body
 *   structure to judge by (e.g. a small Liquid snippet).
 */
export function classifyScriptPlacement(content, marker) {
  if (typeof content !== "string") return "unknown";
  if (typeof marker !== "string" || marker.length === 0) return "unknown";

  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) return "unknown";

  const headOpen = /<head\b[^>]*>/gi;
  const headClose = /<\/head\s*>/gi;
  let openMatch;
  while ((openMatch = headOpen.exec(content)) !== null) {
    headClose.lastIndex = openMatch.index + openMatch[0].length;
    const closeMatch = headClose.exec(content);
    if (!closeMatch) break;
    if (markerIndex > openMatch.index && markerIndex < closeMatch.index) {
      return "head";
    }
  }

  // The marker is present but no <head> region contains it. Only report it as
  // misplaced when the document actually has head/body structure to judge by.
  return /<\s*\/?\s*(?:head|body)\b/i.test(content) ? "body" : "unknown";
}

/**
 * Checks the served storefront HTML for each script's marker.
 *
 * @param {object} input
 * @param {string} input.html     Raw storefront HTML (or "" when unavailable).
 * @param {Record<string,string>} input.markers  Script key -> marker string.
 * @param {ReadonlyArray<{key:string}>} input.scripts  Script definitions.
 * @returns {Array<{key:string, status:string, message:string}>}
 */
export function verifyScriptsInHtml({ html, markers, scripts }) {
  const source = typeof html === "string" ? html : "";
  return scripts.map((script) => {
    const marker = markers?.[script.key];
    if (!marker) {
      return {
        key: script.key,
        status: VERIFY_STATUS.UNABLE,
        message: "This script has no detection marker configured.",
      };
    }
    if (source.includes(marker)) {
      return {
        key: script.key,
        status: VERIFY_STATUS.VERIFIED,
        message: "Script marker found in the storefront HTML.",
      };
    }
    return {
      key: script.key,
      status: VERIFY_STATUS.NOT_DETECTED,
      message:
        "Script marker was not found on the storefront. Check the install location, save and publish the theme, then verify again.",
    };
  });
}

/**
 * Verifies scripts against two independent sources: the live theme's files
 * (read through the Admin API) and the served storefront HTML.
 *
 * A script is VERIFIED when its marker appears in either source. A source that
 * was actually read (the theme read succeeded, or the storefront HTML was
 * fetched and is not a password page) counts as a real negative when the marker
 * is absent — so a marker found in the theme is verified even when the
 * storefront is password-protected or cached, and a marker absent everywhere is
 * reported as not-detected, never as "unable".
 *
 * A script that is present but not inside `<head>` (for example pasted into the
 * `<body>`) is reported as `misplaced`, never as verified — placement matters
 * for a storefront optimization script.
 *
 * @param {object} input
 * @param {ReadonlyArray<{key:string, src?:string}>} input.scripts
 *   Script definitions; `src` (when present) is the exact per-shop script URL
 *   that must also appear in a source for it to count as verified.
 * @param {Record<string,string>} input.markers
 * @param {boolean} [input.themeAvailable] whether the live theme was read
 * @param {ReadonlyArray<{filename:string, content:string}>} [input.themeFiles]
 * @param {string} [input.html] served storefront HTML
 * @param {boolean} [input.storefrontChecked] whether the HTML is usable
 * @param {string} [input.unableMessage] shown when no source could be read
 * @returns {Array<{key:string, status:string, message:string}>}
 */
export function verifyScriptsAcrossSources({
  scripts = [],
  markers,
  themeAvailable = false,
  themeFiles = [],
  html = "",
  storefrontChecked = false,
  unableMessage = "The script could not be verified automatically.",
} = {}) {
  const files = Array.isArray(themeFiles) ? themeFiles : [];

  return scripts.map((script) => {
    const marker = markers?.[script.key];
    if (!marker) {
      return {
        key: script.key,
        status: VERIFY_STATUS.UNABLE,
        message: "This script has no detection marker configured.",
      };
    }

    // The exact per-shop script URL, when the definition carries one. A source
    // then only counts as a real match when it contains BOTH the marker and
    // that URL, so an outdated snippet is never reported as verified.
    const src = typeof script?.src === "string" ? script.src.trim() : "";
    const hasMarker = (content) =>
      typeof content === "string" && content.includes(marker);
    const matches = (content) =>
      hasMarker(content) && (!src || content.includes(src));

    const themeMatch = themeAvailable
      ? files.find((file) => matches(file?.content))
      : null;
    const storefrontMatch = storefrontChecked && matches(html);

    if (themeMatch || storefrontMatch) {
      // The script is installed. Now check its PLACEMENT: it must sit inside
      // <head>, just before </head>. The live storefront HTML is the rendered
      // truth, so it wins when it carries the script; otherwise the matched
      // theme file is judged.
      const placementSource = storefrontMatch
        ? "the storefront HTML"
        : `the live theme file "${themeMatch.filename}"`;
      const placement = classifyScriptPlacement(
        storefrontMatch ? html : themeMatch?.content,
        marker,
      );

      if (placement === "body") {
        return {
          key: script.key,
          status: VERIFY_STATUS.MISPLACED,
          message: `The script is installed in ${placementSource}, but it is outside <head> (for example in the <body>). Move it just before </head>, save the theme, then verify again.`,
        };
      }

      return {
        key: script.key,
        status: VERIFY_STATUS.VERIFIED,
        message:
          placement === "head"
            ? `Script found inside <head> in ${placementSource}.`
            : `Script found in ${placementSource}. Its position inside <head> could not be confirmed — make sure it sits just before </head>.`,
      };
    }

    // The marker is installed, but not the current URL: an older snippet is
    // still in place. Report it honestly instead of a false pass.
    const staleInstall =
      src &&
      (themeAvailable || storefrontChecked) &&
      (files.some((file) => hasMarker(file?.content)) || hasMarker(html));
    if (staleInstall) {
      return {
        key: script.key,
        status: VERIFY_STATUS.NOT_DETECTED,
        message:
          "An older version of the script is installed. Replace it with the current script from this page, save the theme, then verify again.",
      };
    }

    if (themeAvailable || storefrontChecked) {
      const where =
        themeAvailable && storefrontChecked
          ? "the live theme files or the storefront HTML"
          : themeAvailable
            ? "the live theme files"
            : "the storefront HTML";
      return {
        key: script.key,
        status: VERIFY_STATUS.NOT_DETECTED,
        message: `Marker was not found in ${where}. Check the install location, save the theme, then verify again.`,
      };
    }

    return {
      key: script.key,
      status: VERIFY_STATUS.UNABLE,
      message: unableMessage,
    };
  });
}

/**
 * Computes the overall setup status from a verification attempt.
 *
 * - `unknown` when the storefront could not be fetched or is password
 *   protected: we cannot honestly confirm anything.
 * - `complete` when every script verified.
 * - `incomplete` otherwise.
 */
export function computeOverallStatus({ fetchOk, passwordPage, results } = {}) {
  if (!fetchOk || passwordPage) return OVERALL_STATUS.UNKNOWN;
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) return OVERALL_STATUS.UNKNOWN;
  return list.every((result) => isVerifiedStatus(result?.status))
    ? OVERALL_STATUS.COMPLETE
    : OVERALL_STATUS.INCOMPLETE;
}

/**
 * Friendly human labels for the per-script statuses (rendered in the UI).
 */
export const STATUS_LABELS = {
  [VERIFY_STATUS.VERIFIED]: "Verified",
  [VERIFY_STATUS.MISPLACED]: "Installed outside <head>",
  [VERIFY_STATUS.NOT_DETECTED]: "Not detected",
  [VERIFY_STATUS.UNABLE]: "Unable to verify automatically",
};

/** Human label for an overall status. */
export function overallStatusLabel(status) {
  switch (status) {
    case OVERALL_STATUS.COMPLETE:
      return "Setup complete";
    case OVERALL_STATUS.INCOMPLETE:
      return "Setup incomplete";
    case OVERALL_STATUS.UNKNOWN:
      return "Verification pending";
    default:
      return "Not configured";
  }
}