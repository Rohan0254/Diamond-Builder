// Filter primitives shared by the super admin list pages (pure).
//
// The panel's list pages (shops, tickets) all take the same GET filter set — a
// free-text search plus an inclusive from/to calendar date range — so parsing it
// lives here instead of being copy-pasted per module. Turned into Prisma `where`
// clauses by `installs.js` / `tickets.js` and covered by their tests.

export const FILTER_ALL = "all";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Trims a free-text search term and caps its length. */
export function normalizeSearch(value, maxLength = 120) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Parses a `YYYY-MM-DD` value into a UTC Date. `endOfDay` makes it the last
 * millisecond of that day so an inclusive "to" filter keeps the whole day.
 * Returns null for anything that is not a plain calendar date.
 */
export function parseDayValue(value, { endOfDay = false } = {}) {
  if (typeof value !== "string" || !DAY_PATTERN.test(value.trim())) return null;
  const [year, month, day] = value.trim().split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
  // Reject rolled-over dates such as 2026-02-31.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** Builds a Prisma date range from inclusive `from`/`to` day strings. */
export function buildDateRange(from, to) {
  const gte = parseDayValue(from);
  const lte = parseDayValue(to, { endOfDay: true });
  if (!gte && !lte) return null;
  const range = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  return range;
}

/** The search + date-range half of the filter set, from URL params or a form. */
export function readCommonFilters(params) {
  return {
    search: normalizeSearch(params.get("q")),
    from: normalizeSearch(params.get("from"), 10),
    to: normalizeSearch(params.get("to"), 10),
  };
}

/** Human summary of the search + date range, for the results line. */
export function describeDateRange({ search, from, to } = {}) {
  const parts = [];
  const term = normalizeSearch(search);
  if (term) parts.push(`matching “${term}”`);
  if (parseDayValue(from) && parseDayValue(to)) {
    parts.push(`${from} to ${to}`);
  } else if (parseDayValue(from)) {
    parts.push(`from ${from}`);
  } else if (parseDayValue(to)) {
    parts.push(`until ${to}`);
  }
  return parts;
}
