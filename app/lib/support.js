// Pure support-ticket logic shared by the Help page action, the server module
// and the tests. Exactly like `app/lib/billing.js`: no Shopify/Prisma imports,
// deterministic helpers only. The actual MongoDB persistence and notifications
// live in `app/support.server.js`.

export const TICKET_STATUS_OPEN = "OPEN";

/**
 * The full ticket lifecycle used by the super admin panel. New tickets always
 * arrive as OPEN (see `buildSupportTicketRecord`); staff move them on from there.
 */
export const TICKET_STATUSES = Object.freeze([
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);

export const TICKET_STATUS_LABELS = Object.freeze({
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
});

/** Badge tone per status; the routes map it to a CSS class. */
export const TICKET_STATUS_TONES = Object.freeze({
  OPEN: "critical",
  IN_PROGRESS: "info",
  RESOLVED: "positive",
  CLOSED: "neutral",
});

/** Normalizes a status from a form. Returns "" for an unknown value. */
export function normalizeTicketStatus(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return TICKET_STATUSES.includes(normalized) ? normalized : "";
}

/** True for statuses that still need attention (used by the dashboard metric). */
export function isUnresolvedTicketStatus(status) {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export const SUPPORT_NAME_MAX_LENGTH = 120;
export const SUPPORT_EMAIL_MAX_LENGTH = 254;
export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trims and lower-cases an email address for storage. */
export function normalizeSupportEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/** Trims a free-text field, collapsing nothing else. */
export function normalizeSupportText(value, maxLength = Infinity) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Server-side validation for a support request. Returns field-level errors
 * (safe to send to the client so the form can render inline messages) plus the
 * trimmed values that passed.
 *
 * @param {object} input
 * @param {unknown} input.name
 * @param {unknown} input.email
 * @param {unknown} input.message
 * @returns {{ok:boolean, fieldErrors:Record<string,string>, values:{name:string,email:string,message:string}}}
 */
export function validateSupportRequest({ name, email, message } = {}) {
  const values = {
    name: normalizeSupportText(name, SUPPORT_NAME_MAX_LENGTH),
    email: normalizeSupportEmail(email),
    message: normalizeSupportText(message, SUPPORT_MESSAGE_MAX_LENGTH),
  };
  const fieldErrors = {};
  if (!values.name) {
    fieldErrors.name = "Name is required.";
  }
  if (!values.email) {
    fieldErrors.email = "Email address is required.";
  } else if (!EMAIL_PATTERN.test(values.email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!values.message) {
    fieldErrors.message = "Message is required.";
  }
  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors, values };
}

const TICKET_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function toBase36(value) {
  // Values here (< 36^8 ≈ 2.8e12) are always within Number.MAX_SAFE_INTEGER,
  // so plain arithmetic is exact and avoids BigInt lint/transport concerns.
  let n = Math.trunc(value);
  let out = "";
  do {
    out = TICKET_ALPHABET[n % 36] + out;
    n = Math.floor(n / 36);
  } while (n > 0);
  return out;
}

/**
 * Generates a short, unique, human-readable ticket id in the form `SS-XXXXXX`
 * (e.g. `SS-K4F2MQ8PZ3`). Time-derived prefix keeps ids ordered; the random
 * tail makes collisions negligible. The random source is injectable so tests
 * never collide.
 */
export function generateTicketId({ now = Date.now(), random = Math.random } = {}) {
  const timePart = toBase36(now % 36 ** 6).padStart(6, "0");
  let randomPart = "";
  for (let i = 0; i < 4; i += 1) {
    randomPart += TICKET_ALPHABET[Math.floor(random() * 36) % 36];
  }
  return `SS-${timePart}${randomPart}`;
}

/**
 * Builds the record persisted to MongoDB. Throws when the input is invalid —
 * callers validate first with `validateSupportRequest`. `shop` is passed by the
 * server from the authenticated session; it is never taken from the client.
 */
export function buildSupportTicketRecord({
  shop,
  name,
  email,
  message,
  now = new Date(),
  ticketId = generateTicketId({ now: now.getTime() }),
} = {}) {
  if (typeof shop !== "string" || shop.trim() === "") {
    throw new Error("A shop is required to store a support ticket.");
  }
  return {
    ticketId,
    shop: shop.trim().toLowerCase(),
    name: normalizeSupportText(name, SUPPORT_NAME_MAX_LENGTH),
    email: normalizeSupportEmail(email),
    message: normalizeSupportText(message, SUPPORT_MESSAGE_MAX_LENGTH),
    status: TICKET_STATUS_OPEN,
    createdAt: now,
  };
}

/**
 * Sliding-window rate limit check (pure, injectable). `now` is in ms.
 */
export function withinRateLimit(
  history,
  { max = 5, windowMs = 60 * 60 * 1000, now = Date.now() } = {},
) {
  const list = Array.isArray(history) ? history : [];
  const recent = list.filter((t) => typeof t === "number" && now - t < windowMs);
  return {
    allowed: recent.length < max,
    recent,
  };
}