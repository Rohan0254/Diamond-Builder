// Small display helpers for the super admin panel (pure).
//
// Dates are rendered in UTC on purpose: the panel is server-rendered, the host
// runs in UTC and staff look at install/uninstall history — a fixed, unambiguous
// timestamp is more useful than a locale-shifted one, and it keeps the SSR and
// client render identical.

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** "12 Oct 2026, 14:05" (UTC). Empty string for a missing/invalid date. */
export function formatDateTime(value) {
  const date = toDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : "";
}

/** "12 Oct 2026" (UTC). Empty string for a missing/invalid date. */
export function formatDate(value) {
  const date = toDate(value);
  return date ? DATE_FORMATTER.format(date) : "";
}

const RELATIVE_UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** "3 days ago", "just now" — used for the recent-activity lists. */
export function formatRelativeTime(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  const diff = nowMs - date.getTime();
  if (!Number.isFinite(diff)) return "";
  if (diff < 0) return "scheduled";
  if (diff < 60 * 1000) return "just now";
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (diff >= ms) {
      const count = Math.floor(diff / ms);
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

/** Thousands-separated integer, e.g. 1,204. Non-finite values render as "0". */
export function formatNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-US");
}

/** Single-line preview of a long message, with an ellipsis when clipped. */
export function truncate(value, max = 120) {
  if (typeof value !== "string") return "";
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/** "42%" for a part of a whole; "" when the whole is zero. */
export function sharePercent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return "";
  return `${Math.round((part / whole) * 100)}%`;
}

/** Up to two initials for an avatar bubble. */
export function initials(name, email = "") {
  const source = typeof name === "string" && name.trim() ? name.trim() : email;
  const words = String(source).split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
