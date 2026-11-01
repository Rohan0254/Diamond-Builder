import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  STAFF_ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  isStaffRole,
  normalizeStaffRole,
  roleLabel,
  hasPermission,
  canManageStaff,
} from "./roles.js";

describe("roles: isStaffRole", () => {
  test("returns true for known roles", () => {
    for (const role of STAFF_ROLES) {
      assert.equal(isStaffRole(role), true);
    }
  });
  test("returns false for unknown roles", () => {
    assert.equal(isStaffRole("customer"), false);
    assert.equal(isStaffRole(null), false);
    assert.equal(isStaffRole(""), false);
  });
});

describe("roles: normalizeStaffRole", () => {
  test("normalizes and validates", () => {
    assert.equal(normalizeStaffRole("super_admin"), "SUPER_ADMIN");
    assert.equal(normalizeStaffRole("  admin  "), "ADMIN");
    assert.equal(normalizeStaffRole("viewer"), "VIEWER");
    assert.equal(normalizeStaffRole("support"), "SUPPORT");
    assert.equal(normalizeStaffRole("unknown"), "");
    assert.equal(normalizeStaffRole(""), "");
  });
});

test("roles: labels and permissions", () => {
  assert.equal(roleLabel(ROLES.SUPER_ADMIN), ROLE_LABELS.SUPER_ADMIN);
  assert.equal(roleLabel("UNKNOWN"), "Unknown role");
  assert.equal(hasPermission(ROLES.VIEWER, PERMISSIONS.STAFF_MANAGE), false);
  assert.equal(hasPermission(ROLES.SUPER_ADMIN, PERMISSIONS.STAFF_MANAGE), true);
  assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.TICKETS_MANAGE), true);
  assert.equal(canManageStaff(ROLES.SUPER_ADMIN), true);
  assert.equal(canManageStaff(ROLES.ADMIN), false);
});
