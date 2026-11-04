// Super admin panel roles and permissions (pure).
//
// The panel at `/admin` sits outside the Shopify admin: it has its own staff
// accounts (see `app/admin-auth.server.js`) and none of Shopify's per-shop access
// control applies. Every capability the panel checks is declared here, so a
// route, a nav item and the tests can never disagree about what a role may do.
//
// There is no Shopify or database import in this file — it is deterministic and
// unit tested in `roles.test.js`.

export const ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SUPPORT: "SUPPORT",
  VIEWER: "VIEWER",
});

/** Every valid role, in privilege order (highest first). */
export const STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SUPPORT,
  ROLES.VIEWER,
]);

export const ROLE_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.SUPPORT]: "Support",
  [ROLES.VIEWER]: "Viewer",
});

export const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]:
    "Full access, including creating staff accounts and changing roles.",
  [ROLES.ADMIN]:
    "Shops, install logs and support tickets. Cannot manage staff.",
  [ROLES.SUPPORT]:
    "Read the dashboard and shops, and handle support tickets.",
  [ROLES.VIEWER]: "Read-only access to the dashboard, shops and tickets.",
});

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: "dashboard:view",
  SHOPS_VIEW: "shops:view",
  TICKETS_VIEW: "tickets:view",
  TICKETS_MANAGE: "tickets:manage",
  VENDORS_MANAGE: "vendors:manage",
  STAFF_MANAGE: "staff:manage",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.freeze(Object.values(PERMISSIONS)),
  [ROLES.ADMIN]: Object.freeze([
    PERMISSIONS.VENDORS_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SHOPS_VIEW,
    PERMISSIONS.TICKETS_VIEW,
    PERMISSIONS.TICKETS_MANAGE,
  ]),
  [ROLES.SUPPORT]: Object.freeze([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SHOPS_VIEW,
    PERMISSIONS.TICKETS_VIEW,
    PERMISSIONS.TICKETS_MANAGE,
  ]),
  [ROLES.VIEWER]: Object.freeze([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SHOPS_VIEW,
    PERMISSIONS.TICKETS_VIEW,
  ]),
});

/** True when `role` is one of the four known roles. */
export function isStaffRole(role) {
  return typeof role === "string" && STAFF_ROLES.includes(role);
}

/**
 * Normalizes a role coming from a form or the database: trims, upper-cases and
 * validates. Returns "" for anything unknown, so callers can reject it.
 */
export function normalizeStaffRole(role) {
  const value = typeof role === "string" ? role.trim().toUpperCase() : "";
  return isStaffRole(value) ? value : "";
}

/** Human label for a stored role; falls back to a safe placeholder. */
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? "Unknown role";
}

/** The permission list granted to a role (empty for an unknown role). */
export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** True when `role` holds `permission`. */
export function hasPermission(role, permission) {
  return permissionsFor(role).includes(permission);
}

/** Convenience check used by the staff page and the nav. */
export function canManageStaff(role) {
  return hasPermission(role, PERMISSIONS.STAFF_MANAGE);
}
