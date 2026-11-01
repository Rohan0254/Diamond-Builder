// Pure support-ticket list filters for the super admin panel (no Prisma).
//
// Mirrors `installs.js`: the route hands over the URL params, these helpers turn
// them into a Prisma `where` clause, and the tests in `tickets.test.js` pin the
// behaviour. Ticket statuses themselves live in `../support` because they are
// ticket domain rules, not panel concerns.

import { TICKET_STATUSES, normalizeTicketStatus } from "../support";
import {
  FILTER_ALL,
  buildDateRange,
  describeDateRange,
  normalizeSearch,
  readCommonFilters,
} from "./filters";

export { TICKET_STATUSES };

/** Maps the URL status filter onto a stored ticket status, or `all`. */
export function normalizeTicketStatusFilter(status) {
  return normalizeTicketStatus(status) || "all";
}

/** Reads the ticket-list filter set out of URL params. */
export function readTicketFilters(params) {
  return {
    status: normalizeTicketStatusFilter(params.get("status")),
    ...readCommonFilters(params),
  };
}

/** Prisma `where` for the ticket list (`SupportTicket`). */
export function buildTicketWhere({ status, search, from, to } = {}) {
  const where = {};
  const normalizedStatus = normalizeTicketStatus(status);
  if (normalizedStatus) where.status = normalizedStatus;

  const term = normalizeSearch(search);
  if (term) {
    where.OR = [
      { ticketId: { contains: term } },
      { shop: { contains: term } },
      { name: { contains: term } },
      { email: { contains: term } },
      { message: { contains: term } },
    ];
  }

  const range = buildDateRange(from, to);
  if (range) where.createdAt = range;
  return where;
}

/** Human summary of the active ticket filters, for the results line. */
export function describeTicketFilters({ status, search, from, to } = {}) {
  const normalized = normalizeTicketStatusFilter(status);
  const parts = [];
  if (normalized !== "all") parts.push(normalized.replace("_", " ").toLowerCase());
  parts.push(...describeDateRange({ search, from, to }));
  return parts.length ? `Showing ${parts.join(", ")}.` : "Showing all tickets.";
}
