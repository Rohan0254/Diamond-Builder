import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStaffEmail,
  normalizeStaffName,
  validateStaffPassword,
  validateNewStaff,
  validateStaffUpdate,
  evaluateStaffChange,
} from "./staff.js";

describe("staff: normalization", () => {
  test("normalizes email and name", () => {
    assert.equal(normalizeStaffEmail("  Alice@Example.com "), "alice@example.com");
    assert.equal(normalizeStaffName("  Alice  "), "Alice");
    const longName = new Array(200).fill("a").join("");
    assert.equal(normalizeStaffName(longName).length, 120);
  });
});

describe("staff: validation", () => {
  test("validates a new staff member", () => {
    const result = validateNewStaff({
      name: " Alice ",
      email: "alice@example.com",
      password: "Password123",
      role: "super_admin",
    });
    assert.equal(result.ok, true);
    assert.equal(result.values.name, "Alice");
    assert.equal(result.values.email, "alice@example.com");
    assert.equal(result.values.role, "SUPER_ADMIN");
  });

  test("flags bad inputs", () => {
    const r = validateNewStaff({ name: "", email: "bad", password: "short", role: "????" });
    assert.equal(r.ok, false);
    assert.ok(r.fieldErrors.name);
    assert.ok(r.fieldErrors.email);
    assert.ok(r.fieldErrors.password);
    assert.ok(r.fieldErrors.role);
  });
});

describe("staff: password strength", () => {
  test("requires length and mixed classes", () => {
    assert.equal(validateStaffPassword("Password123").ok, true);
    assert.equal(validateStaffPassword("Password123").ok, true);
    assert.equal(validateStaffPassword("password123").ok, false); // all lower — missing upper + symbols
    assert.equal(validateStaffPassword("abc123").ok, false); // short, no upper
    assert.equal(validateStaffPassword("Passw0rd!").ok, true);
  });
});

describe("staff: mutation rules", () => {
  test("protects the last super admin", () => {
    const target = { id: "1", role: "SUPER_ADMIN", active: true };
    const actor = { id: "1" };
    // self cannot deactivate
    assert.equal(evaluateStaffChange({ actorId: actor.id, target, change: { active: false }, activeSuperAdmins: 1 }).ok, false);
    // another account cannot remove the last one
    const other = { id: "2", role: "SUPER_ADMIN", active: true };
    assert.equal(evaluateStaffChange({ actorId: "2", target, change: { active: false }, activeSuperAdmins: 1 }).ok, false);
  });
});
