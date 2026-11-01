import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORT_MESSAGE_MAX_LENGTH,
  TICKET_STATUS_OPEN,
  buildSupportTicketRecord,
  generateTicketId,
  normalizeSupportEmail,
  normalizeSupportText,
  validateSupportRequest,
  withinRateLimit,
} from "./support.js";

test("validation accepts a valid request and trims values", () => {
  const result = validateSupportRequest({
    name: "  Rohan  ",
    email: "  Rohan@Example.COM ",
    message: "  Help me!  ",
  });
  assert.equal(result.ok, true);
  assert.equal(result.values.name, "Rohan");
  assert.equal(result.values.email, "rohan@example.com");
  assert.equal(result.values.message, "Help me!");
  assert.deepEqual(result.fieldErrors, {});
});

test("validation rejects missing required fields", () => {
  const result = validateSupportRequest({ name: "", email: "", message: "" });
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.name);
  assert.ok(result.fieldErrors.email);
  assert.ok(result.fieldErrors.message);
});

test("validation rejects malformed email addresses", () => {
  for (const email of ["nope", "a@b", "a b@c.com", "@x.com", "x@.com"]) {
    const result = validateSupportRequest({ name: "A", email, message: "body" });
    assert.equal(result.ok, false, `expected ${email} to fail`);
    assert.ok(result.fieldErrors.email, `expected email error for ${email}`);
  }
  const ok = validateSupportRequest({ name: "A", email: "a.b+c@example.co.uk", message: "body" });
  assert.equal(ok.ok, true);
});

test("whitespace-only fields are treated as missing", () => {
  const result = validateSupportRequest({ name: "   ", email: "x@y.co", message: "   " });
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.name);
  assert.ok(result.fieldErrors.message);
});

test("long message input is truncated to the storage limit", () => {
  const long = "a".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 500);
  const result = validateSupportRequest({ name: "A", email: "a@b.co", message: long });
  assert.equal(result.ok, true);
  assert.equal(result.values.message.length, SUPPORT_MESSAGE_MAX_LENGTH);
});

test("ticket ids follow SS-XXXXXX format and vary with time and randomness", () => {
  const ids = new Set();
  for (let i = 0; i < 100; i += 1) {
    const id = generateTicketId({ now: 1_700_000_000_000 + i, random: () => 0 });
    assert.match(id, /^SS-[A-Z0-9]{10}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 100); // time part differs per ms, random tail is stable
});

test("ticket ids differ when the random tail differs", () => {
  const randomValues = [() => 0.1, () => 0.9];
  const a = generateTicketId({ now: 1_700_000_000_000, random: randomValues[0] });
  const b = generateTicketId({ now: 1_700_000_000_000, random: randomValues[1] });
  assert.notEqual(a, b);
});

test("buildSupportTicketRecord produces the persisted shape (support ticket persistence)", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");
  const record = buildSupportTicketRecord({
    shop: "  Example.myshopify.com  ",
    name: "  Rohan  ",
    email: "  RH@Example.COM ",
    message: "  Need help  ",
    now,
    ticketId: "SS-ABCDEF1234",
  });
  assert.equal(record.ticketId, "SS-ABCDEF1234");
  assert.equal(record.shop, "example.myshopify.com");
  assert.equal(record.name, "Rohan");
  assert.equal(record.email, "rh@example.com");
  assert.equal(record.message, "Need help");
  assert.equal(record.status, TICKET_STATUS_OPEN);
  assert.equal(record.createdAt, now);
});

test("buildSupportTicketRecord always needs a shop passed by the server", () => {
  assert.throws(
    () => buildSupportTicketRecord({ shop: "", name: "A", email: "a@b.co", message: "x" }),
    /shop is required/,
  );
});

test("rate limiting allows under the limit and rejects at or beyond it", () => {
  const now = 1_700_000_000_000;
  const history = [now - 1000, now - 2000, now - 3000, now - 4000];
  const under = withinRateLimit(history, { max: 5, windowMs: 60_000, now });
  assert.equal(under.allowed, true);
  assert.deepEqual(under.recent, history);

  const atLimit = withinRateLimit([...history, now - 500], { max: 5, windowMs: 60_000, now });
  assert.equal(atLimit.allowed, false);

  // Old entries fall out of the window.
  const aged = withinRateLimit([now - 120_000, now - 10], { max: 1, windowMs: 60_000, now });
  assert.equal(aged.allowed, false, "one entry inside window hits the max of 1");
  const agedOk = withinRateLimit([now - 120_000], { max: 1, windowMs: 60_000, now });
  assert.equal(agedOk.allowed, true, "stale entries are ignored");
});

test("email normalization lower-cases and trims", () => {
  assert.equal(normalizeSupportEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizeSupportEmail(undefined), "");
  assert.equal(normalizeSupportText("  hi there  "), "hi there");
  assert.equal(normalizeSupportText("123456", 3), "123");
});