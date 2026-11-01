// Pure install / uninstall log helpers (no Prisma, no Shopify).
//
// The super admin panel lists shops and their lifecycle history. Filters arrive
// as URL search params and are turned into Prisma `where` clauses here, so the
// route stays thin and the filter rules are unit tested in `installs.test.js`.
//
// The search + date-range primitives are shared with the ticket list and live in
// `./filters`; they are re-exported here so existing callers keep one import.

import {
  FILTER_ALL,
  buildDateRange,
  describeDateRange,
  normalizeSearch,
  parseDayValue,
  readCommonFilters,
} from "./filters.js";

export { FILTER_ALL, buildDateRange, normalizeSearch, parseDayValue };

export const INSTALL_STATUS = Object.freeze({
  INSTALLED: "INSTALLED",
  UNINSTALLED: "UNINSTALLED",
});

export const INSTALL_STATUS_LABELS = Object.freeze({
  [INSTALL_STATUS.INSTALLED]: "Installed",
  [INSTALL_STATUS.UNINSTALLED]: "Uninstalled",
});

export const SHOP_EVENT_TYPE = Object.freeze({
  INSTALLED: "INSTALLED",
  REINSTALLED: "REINSTALLED",
  UNINSTALLED: "UNINSTALLED",
});

export const SHOP_EVENT_LABELS = Object.freeze({
  [SHOP_EVENT_TYPE.INSTALLED]: "Installed",
  [SHOP_EVENT_TYPE.REINSTALLED]: "Reinstalled",
  [SHOP_EVENT_TYPE.UNINSTALLED]: "Uninstalled",
});

/** Visual tone for an event badge; the route maps it to a CSS class. */
export const SHOP_EVENT_TONES = Object.freeze({
  [SHOP_EVENT_TYPE.INSTALLED]: "positive",
  [SHOP_EVENT_TYPE.REINSTALLED]: "info",
  [SHOP_EVENT_TYPE.UNINSTALLED]: "critical",
});

/** Trims and lower-cases a shop domain for storage/lookup. */
export function normalizeShopDomain(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase();
}

/** Maps the URL status filter onto the stored `ShopInstallation.status`. */
export function normalizeInstallStatusFilter(status) {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (value === "installed" || value === "uninstalled") return value;
  return FILTER_ALL;
}

/** Reads the shop-list filter set out of URL params. */
export function readFilters(params) {
  return {
    status: normalizeInstallStatusFilter(params.get("status")),
    ...readCommonFilters(params),
  };
}

/** Prisma `where` for the shop list (`ShopInstallation`). */
export function buildInstallationWhere({ status, search, from, to } = {}) {
  const where = {};
  const normalizedStatus = normalizeInstallStatusFilter(status);
  if (normalizedStatus !== FILTER_ALL) {
    where.status = normalizedStatus.toUpperCase();
  }
  const term = normalizeSearch(search);
  if (term) {
    where.OR = [
      { shop: { contains: term } },
      { name: { contains: term } },
      { email: { contains: term } },
      { domain: { contains: term } },
    ];
  }
  const range = buildDateRange(from, to);
  if (range) where.lastEventAt = range;
  return where;
}

/** Prisma `where` for the lifecycle log (`ShopEvent`). */
export function buildShopEventWhere({ status, search, from, to } = {}) {
  const where = {};
  const normalizedStatus = normalizeInstallStatusFilter(status);
  if (normalizedStatus === "installed") {
    where.type = { in: [SHOP_EVENT_TYPE.INSTALLED, SHOP_EVENT_TYPE.REINSTALLED] };
  } else if (normalizedStatus === "uninstalled") {
    where.type = SHOP_EVENT_TYPE.UNINSTALLED;
  }
  const term = normalizeSearch(search);
  if (term) {
    where.OR = [
      { shop: { contains: term } },
      { name: { contains: term } },
      { email: { contains: term } },
      { domain: { contains: term } },
    ];
  }
  const range = buildDateRange(from, to);
  if (range) where.at = range;
  return where;
}

/**
 * Which lifecycle event an install represents: the first one, or a return after
 * an uninstall. Takes the *previous* status (or undefined when unknown).
 */
export function eventTypeForInstall(previousStatus) {
  return normalizeInstallStatusFilter(previousStatus) === "uninstalled"
    ? SHOP_EVENT_TYPE.REINSTALLED
    : SHOP_EVENT_TYPE.INSTALLED;
}

/** Human summary of the active filters, for the results line. */
export function describeFilters({ status, search, from, to } = {}) {
  const normalizedStatus = normalizeInstallStatusFilter(status);
  const parts = [];
  if (normalizedStatus !== FILTER_ALL) parts.push(normalizedStatus);
  parts.push(...describeDateRange({ search, from, to }));
  return parts.length ? `Showing ${parts.join(", ")}.` : "Showing all shops.";
}
