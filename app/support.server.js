// Server-side support ticketing for Diamond Builder (Help page).
//
// Responsibilities:
//   - validate submissions server-side (re-validating what the client checks),
//   - persist the ticket in MongoDB with a unique ticket id, the authenticated
//     shop, the submission timestamp and an OPEN status,
//   - prevent duplicate submissions (rate limit + short message-dedupe window),
//   - notify the configured support inbox best-effort AFTER the ticket is
//     stored. When no email/webhook transport is configured nothing is sent and
//     no delivery is claimed.

import prisma from "./db.server";
import {
  buildSupportTicketRecord,
  normalizeSupportEmail,
  normalizeSupportText,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_NAME_MAX_LENGTH,
  validateSupportRequest,
  withinRateLimit,
} from "./lib/support";

export const SUPPORT_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
export const SUPPORT_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const NOTIFICATION_TIMEOUT_MS = 8000;

// In-memory guardrails (single instance; best-effort on multiple instances).
const submissionHistory = new Map(); // shop -> timestamps[]
const recentTickets = new Map(); // shop -> [{key, ticketId, at}]

/** Honeypot field name — a submitted value means a bot filled the form. */
export const HONEYPOT_FIELD = "website";

function hashMessage(message) {
  // Cheap but sufficient dedupe key; not a security feature.
  const value = normalizeSupportText(message, SUPPORT_MESSAGE_MAX_LENGTH);
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return String(hash);
}

/** Trims values and enforces length limits before storage/validation. */
export function sanitizeSupportInput(formData) {
  const raw = (key) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: normalizeSupportText(raw("name"), SUPPORT_NAME_MAX_LENGTH),
    email: normalizeSupportEmail(raw("email")),
    message: normalizeSupportText(raw("message"), SUPPORT_MESSAGE_MAX_LENGTH),
    honeypot: String(raw(HONEYPOT_FIELD)),
  };
}

/**
 * Persists a validated support ticket. Returns `{ ok, ticketId, notified,
 * notificationReason, duplicate }`. Never throws for notification failures:
 * the ticket is retained and the notification failure is surfaced separately,
 * exactly like the requirement states.
 */
export async function createSupportTicket({
  shop,
  name,
  email,
  message,
  env = process.env,
  now = new Date(),
} = {}) {
  const validation = validateSupportRequest({ name, email, message });
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.fieldErrors };
  }
  const values = validation.values;
  const domain = typeof shop === "string" ? shop.trim().toLowerCase() : "";
  if (!domain) {
    return { ok: false, error: "The shop could not be identified." };
  }
  const timestamp = now.getTime();

  // Sliding-window rate limit per shop (prevents spam from repeated clicks).
  const history = submissionHistory.get(domain) ?? [];
  const rate = withinRateLimit(history, {
    max: SUPPORT_RATE_LIMIT.max,
    windowMs: SUPPORT_RATE_LIMIT.windowMs,
    now: timestamp,
  });
  if (!rate.allowed) {
    submissionHistory.set(domain, rate.recent);
    return {
      ok: false,
      error:
        "You've sent several messages recently. Please wait a bit and try again.",
    };
  }
  submissionHistory.set(domain, [...rate.recent, timestamp]);

  // Short message-based dedupe: the same shop submitting the same message
  // within the window returns the existing ticket id instead of a new row.
  const key = `${domain}:${hashMessage(values.message)}`;
  const recent = recentTickets.get(domain) ?? [];
  const existing = recent.find(
    (entry) => entry.key === key && timestamp - entry.at < SUPPORT_DEDUPE_WINDOW_MS,
  );
  if (existing) {
    return {
      ok: true,
      ticketId: existing.ticketId,
      notified: false,
      notificationReason: "duplicate",
      duplicate: true,
    };
  }

  const record = buildSupportTicketRecord({
    shop: domain,
    name: values.name,
    email: values.email,
    message: values.message,
    now,
  });

  let saved;
  try {
    saved = await prisma.supportTicket.create({ data: record });
  } catch (error) {
    console.error("[support.server] failed to persist ticket", error);
    return {
      ok: false,
      error: "Your message could not be saved right now. Please try again.",
    };
  }

  recentTickets.set(domain, [
    ...recent.filter((entry) => timestamp - entry.at < SUPPORT_DEDUPE_WINDOW_MS),
    { key, ticketId: saved.ticketId, at: timestamp },
  ]);

  const notification = await notifySupportTicket(saved, env);
  return {
    ok: true,
    ticketId: saved.ticketId,
    notified: notification.sent,
    notificationReason: notification.reason,
    duplicate: false,
  };
}

/**
 * Best-effort support notification.
 *
 * No email transport exists in this project, so by default nothing is sent and
 * the result honestly reports `sent: false` with reason `not-configured`. To
 * wire delivery without adding a dependency, set `SUPPORT_EMAIL_WEBHOOK_URL`:
 * the ticket is POSTed as JSON to that URL. A failure after the ticket is
 * stored leaves the ticket intact and is reported separately.
 */
export async function notifySupportTicket(ticket, env = process.env) {
  const webhookUrl =
    typeof env?.SUPPORT_EMAIL_WEBHOOK_URL === "string"
      ? env.SUPPORT_EMAIL_WEBHOOK_URL.trim()
      : "";
  if (!webhookUrl) {
    return { sent: false, reason: "not-configured" };
  }
  const payload = {
    event: "support_ticket.created",
    ticket: {
      ticketId: ticket.ticketId,
      shop: ticket.shop,
      name: ticket.name,
      email: ticket.email,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      sent: response.ok,
      reason: response.ok ? "webhook-ok" : `webhook-status-${response.status}`,
    };
  } catch (error) {
    return {
      sent: false,
      reason: error?.name === "AbortError" ? "webhook-timeout" : "webhook-error",
    };
  } finally {
    clearTimeout(timer);
  }
}