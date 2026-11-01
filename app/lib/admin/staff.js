// Staff account input validation and the rules that stop the panel from locking
// itself out (pure — no database, no Shopify, unit tested in `staff.test.js`).
//
// `app/admin-auth.server.js` performs the actual reads/writes; everything about
// what is *allowed* lives here so the login form, the staff page and the tests
// share one definition.

import { normalizeStaffRole, ROLES } from "./roles.js";

export const STAFF_NAME_MAX_LENGTH = 120;
export const STAFF_EMAIL_MAX_LENGTH = 254;
export const STAFF_PASSWORD_MIN_LENGTH = 10;
export const STAFF_PASSWORD_MAX_LENGTH = 200;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trims and lower-cases an email address for storage and lookup. */
export function normalizeStaffEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/** Trims a staff display name and caps its length. */
export function normalizeStaffName(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  return trimmed.length > STAFF_NAME_MAX_LENGTH
    ? trimmed.slice(0, STAFF_NAME_MAX_LENGTH)
    : trimmed;
}

/**
 * Password strength for accounts created in the panel. Length first, then a
 * minimum of two character classes — mirroring what the UI tells the user.
 */
export function validateStaffPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < STAFF_PASSWORD_MIN_LENGTH
  ) {
    return {
      ok: false,
      error: `Use at least ${STAFF_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > STAFF_PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Use at most ${STAFF_PASSWORD_MAX_LENGTH} characters.` };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes < 2) {
    return {
      ok: false,
      error: "Mix upper case, lower case, numbers or symbols.",
    };
  }
  return { ok: true, error: null };
}

/**
 * Validates a new staff account. Returns field-level errors (safe to render
 * inline) plus the normalized values that passed.
 *
 * @param {{name?:unknown,email?:unknown,password?:unknown,role?:unknown}} input
 */
export function validateNewStaff({ name, email, password, role } = {}) {
  const fieldErrors = {};
  const values = {
    name: normalizeStaffName(name),
    email: normalizeStaffEmail(email),
    password: typeof password === "string" ? password : "",
    role: normalizeStaffRole(role),
  };

  if (!values.name) fieldErrors.name = "Name is required.";
  if (!values.email) {
    fieldErrors.email = "Email address is required.";
  } else if (
    values.email.length > STAFF_EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(values.email)
  ) {
    fieldErrors.email = "Enter a valid email address.";
  }
  const strength = validateStaffPassword(values.password);
  if (!strength.ok) fieldErrors.password = strength.error;
  if (!values.role) fieldErrors.role = "Choose a role.";

  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors, values };
}

/**
 * Validates a change to an existing account (name, role, active flag). Passwords
 * are changed through their own action.
 *
 * @param {{name?:unknown,role?:unknown,active?:unknown}} input
 */
export function validateStaffUpdate({ name, role, active } = {}) {
  const fieldErrors = {};
  const values = {
    name: normalizeStaffName(name),
    role: normalizeStaffRole(role),
  };
  if (!values.name) fieldErrors.name = "Name is required.";
  if (!values.role) fieldErrors.role = "Choose a role.";
  // A checkbox submits "on"/"true" (or nothing at all); everything else is off.
  values.active =
    active === true ||
    (typeof active === "string" &&
      ["on", "true", "1", "yes"].includes(active.trim().toLowerCase()));
  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors, values };
}

/**
 * Rules that protect the panel from locking itself out.
 *
 * @param {object} params
 * @param {string} params.actorId  id of the signed-in staff member
 * @param {{id:string,role:string,active:boolean}|null} params.target  account being changed
 * @param {{role?:string,active?:boolean,delete?:boolean}} [params.change]
 * @param {number} [params.activeSuperAdmins]  active SUPER_ADMINs, including the target
 * @returns {{ok:true} | {ok:false,error:string}}
 */
export function evaluateStaffChange({
  actorId,
  target,
  change = {},
  activeSuperAdmins = 0,
} = {}) {
  if (!target) {
    return { ok: false, error: "That staff account no longer exists." };
  }

  const isSelf = String(actorId) === String(target.id);
  if (isSelf && (change.delete === true || change.active === false)) {
    return {
      ok: false,
      error: "You cannot deactivate or delete your own account.",
    };
  }
  if (isSelf && change.role && change.role !== target.role) {
    return { ok: false, error: "You cannot change your own role." };
  }

  const demoting = Boolean(change.role) && change.role !== target.role;
  const removesSuperAdmin =
    target.role === ROLES.SUPER_ADMIN &&
    target.active === true &&
    (change.delete === true || change.active === false || demoting);
  if (removesSuperAdmin && activeSuperAdmins <= 1) {
    return { ok: false, error: "At least one active Super Admin must remain." };
  }

  return { ok: true };
}
