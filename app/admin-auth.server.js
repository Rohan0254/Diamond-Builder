// Super admin panel authentication and staff accounts.
//
// The panel at `/admin` is not part of the embedded Shopify app: it has its own
// URL, its own sign-in page and its own accounts (the `StaffUser` collection), so
// none of the Shopify session/token machinery applies. This module owns:
//
//   * the signed session cookie (React Router cookie session storage),
//   * `requireStaff`, the guard every admin route calls,
//   * sign-in / sign-out and sign-in rate limiting,
//   * creating the first Super Admin from environment variables,
//   * the staff account operations used by the staff page.
//
// Passwords are never stored or logged in clear: `lib/admin/password.js` hashes
// them with scrypt and compares in constant time. Auth failures never throw for
// "wrong password" — they return `{ ok: false, error }` so the route can render
// the message inline; only an absent session throws (a redirect to sign-in).

import { createCookieSessionStorage, redirect } from "react-router";
import prisma from "./db.server";
import { hashPassword, verifyPassword } from "./lib/admin/password";
import {
  ROLES,
  hasPermission,
  permissionsFor,
  roleLabel,
} from "./lib/admin/roles";
import {
  evaluateStaffChange,
  normalizeStaffEmail,
  validateNewStaff,
  validateStaffPassword,
  validateStaffUpdate,
} from "./lib/admin/staff";

export const ADMIN_COOKIE_NAME = "__ss_admin_v2";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * Cookie signing key. Preference order: a dedicated secret, then the Shopify app
 * secret (always present in production), then a development fallback so a local
 * checkout still works before the env vars are set.
 */
function sessionSecret(env = process.env) {
  return (
    env.ADMIN_SESSION_SECRET ||
    env.SHOPIFY_API_SECRET ||
    "speed-scratcher-admin-development-secret"
  );
}

export function createAdminSessionStorage(env = process.env) {
  return createCookieSessionStorage({
    cookie: {
      name: ADMIN_COOKIE_NAME,
      httpOnly: true,
      // Dashboard navigation fetches /admin.data, outside the /admin cookie path.
      path: "/",
      sameSite: "lax",
      secrets: [sessionSecret(env)],
      secure: env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    },
  });
}

export const adminSessionStorage = createAdminSessionStorage();

/* ------------------------------------------------------------------ *
 * Sign-in attempt throttling (in-memory, single instance — best-effort
 * like the support-ticket limiter, and only ever a speed bump, never the
 * authorization decision).
 * ------------------------------------------------------------------ */

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map(); // key -> timestamps[]

export function recordLoginAttempt(key, now = Date.now()) {
  const recent = (loginAttempts.get(key) ?? []).filter(
    (at) => now - at < LOGIN_WINDOW_MS * 4,
  );
  loginAttempts.set(key, [...recent, now]);
}

export function isLoginBlocked(key, now = Date.now()) {
  const recent = (loginAttempts.get(key) ?? []).filter(
    (at) => now - at < LOGIN_WINDOW_MS,
  );
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

export function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

/** Constant-work fallback so an unknown email costs the same as a known one. */
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("speed-scratcher-timing-equalizer");
  }
  return dummyHashPromise;
}

/** The signed-in staff member for a request, or null. Never throws. */
export async function getStaffSession(request) {
  try {
    const session = await adminSessionStorage.getSession(
      request.headers.get("Cookie"),
    );
    const staffId = session.get("staffId");
    if (typeof staffId !== "string" || !staffId) return null;
    const user = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!user || !user.active) return null;
    return user;
  } catch (error) {
    console.error("[admin-auth] could not read the staff session", error);
    return null;
  }
}

/**
 * Loader guard for every `/admin` route.
 *
 * Redirects to the sign-in page when there is no session (carrying the current
 * path so the user lands back where they were), and throws a 403 when the
 * signed-in role does not hold `permission` (the admin layout's ErrorBoundary
 * renders that as "Access denied").
 *
 * @param {Request} request
 * @param {string|null} [permission] one of `PERMISSIONS`
 * @returns {Promise<object>} the `StaffUser` record
 */
export async function requireStaff(request, permission = null) {
  const user = await getStaffSession(request);
  if (!user) {
    const url = new URL(request.url);
    const next = `${url.pathname}${url.search}`;
    throw redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }
  if (permission && !hasPermission(user.role, permission)) {
    throw new Response("Forbidden", {
      status: 403,
      statusText: "Forbidden",
    });
  }
  return user;
}

/** The staff fields a page needs — never the password hash. */
export function serializeStaff(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: roleLabel(user.role),
    permissions: permissionsFor(user.role),
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/**
 * Verifies credentials and returns the staff record. Failures are returned, not
 * thrown, and the message never says which half was wrong.
 */
export async function signInStaff({ email, password, now = new Date() } = {}) {
  const normalizedEmail = normalizeStaffEmail(email);
  const rateKey = normalizedEmail || "unknown";

  if (isLoginBlocked(rateKey)) {
    return {
      ok: false,
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  if (!normalizedEmail || typeof password !== "string" || !password) {
    recordLoginAttempt(rateKey);
    return { ok: false, error: "Enter your email and password." };
  }

  const user = await prisma.staffUser.findUnique({
    where: { email: normalizedEmail },
  });
  const passwordOk = await verifyPassword(
    password,
    user?.passwordHash ?? (await getDummyHash()),
  );

  if (!user || !user.active || !passwordOk) {
    recordLoginAttempt(rateKey);
    return { ok: false, error: "Invalid email or password." };
  }

  clearLoginAttempts(rateKey);
  await prisma.staffUser.update({
    where: { id: user.id },
    data: { lastLoginAt: now },
  });
  return { ok: true, user: { ...user, lastLoginAt: now } };
}

/** Commits the session cookie for a signed-in staff member. */
export async function createStaffSessionCookie(user) {
  const session = await adminSessionStorage.getSession();
  session.set("staffId", user.id);
  return adminSessionStorage.commitSession(session);
}

/** Destroys the session cookie for the request. */
export async function destroyStaffSessionCookie(request) {
  const session = await adminSessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  return adminSessionStorage.destroySession(session);
}

/** Number of staff accounts; used by the sign-in page to explain the seed. */
export async function countStaffAccounts() {
  return prisma.staffUser.count();
}

/**
 * Creates the first Super Admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
 * so a fresh deployment is reachable without a setup screen.
 *
 * Only ever runs while the collection is empty: as soon as one account exists it
 * is a no-op, so changing the env vars cannot silently add or reset an account.
 * Returns a reason the sign-in page can explain.
 */
export async function ensureSeedSuperAdmin({ env = process.env, now = new Date() } = {}) {
  const email = normalizeStaffEmail(env.SUPER_ADMIN_EMAIL);
  const password = typeof env.SUPER_ADMIN_PASSWORD === "string" ? env.SUPER_ADMIN_PASSWORD : "";

  if (!email || !password) {
    return { created: false, reason: "not-configured" };
  }
  const strength = validateStaffPassword(password);
  if (!strength.ok) {
    return { created: false, reason: "weak-password" };
  }

  const existing = await prisma.staffUser.count();
  if (existing > 0) {
    return { created: false, reason: "already-initialised" };
  }

  await prisma.staffUser.create({
    data: {
      name: "Super Admin",
      email,
      role: ROLES.SUPER_ADMIN,
      passwordHash: await hashPassword(password),
      createdBy: "SUPER_ADMIN_EMAIL",
      createdAt: now,
    },
  });
  return { created: true, reason: "created", email };
}

/** All staff accounts. Sorting for display happens in the route. */
export async function listStaffAccounts() {
  return prisma.staffUser.findMany({ orderBy: { createdAt: "asc" } });
}

/** Active Super Admins — the count that keeps the panel from locking itself out. */
export async function countActiveSuperAdmins() {
  return prisma.staffUser.count({
    where: { role: ROLES.SUPER_ADMIN, active: true },
  });
}

/**
 * Creates a staff account. Returns `{ ok, user }` or `{ ok:false, fieldErrors }`
 * / `{ ok:false, error }` so the route can render either inline or as a banner.
 */
export async function createStaffAccount({
  actor = null,
  name,
  email,
  role,
  password,
} = {}) {
  const validation = validateNewStaff({ name, email, role, password });
  if (!validation.ok) {
    return {
      ok: false,
      fieldErrors: validation.fieldErrors,
      // Echoed back to the form (never the password) so a failed submit does not
      // make the user retype everything.
      values: {
        name: validation.values.name,
        email: validation.values.email,
        role: validation.values.role,
      },
    };
  }

  const existing = await prisma.staffUser.findUnique({
    where: { email: validation.values.email },
  });
  if (existing) {
    return {
      ok: false,
      fieldErrors: { email: "An account with this email already exists." },
      values: {
        name: validation.values.name,
        email: validation.values.email,
        role: validation.values.role,
      },
    };
  }

  const user = await prisma.staffUser.create({
    data: {
      name: validation.values.name,
      email: validation.values.email,
      role: validation.values.role,
      passwordHash: await hashPassword(validation.values.password),
      createdBy: actor?.email ?? null,
    },
  });
  return { ok: true, user };
}

/** Updates a staff account's name, role and active flag. */
export async function updateStaffAccount({
  actor = null,
  id,
  name,
  role,
  active,
} = {}) {
  const validation = validateStaffUpdate({ name, role, active });
  if (!validation.ok) return { ok: false, fieldErrors: validation.fieldErrors };

  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) {
    return { ok: false, error: "That staff account no longer exists." };
  }

  const allowed = evaluateStaffChange({
    actorId: actor?.id,
    target,
    change: { role: validation.values.role, active: validation.values.active },
    activeSuperAdmins: await countActiveSuperAdmins(),
  });
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const user = await prisma.staffUser.update({
    where: { id },
    data: {
      name: validation.values.name,
      role: validation.values.role,
      active: validation.values.active,
    },
  });
  return { ok: true, user };
}

/** Replaces a staff member's password. */
export async function resetStaffPassword({ id, password } = {}) {
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) {
    return { ok: false, error: "That staff account no longer exists." };
  }
  const strength = validateStaffPassword(password);
  if (!strength.ok) {
    return { ok: false, error: strength.error, field: "password" };
  }
  await prisma.staffUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  return { ok: true };
}

/** Deletes a staff account, subject to the lock-out rules. */
export async function deleteStaffAccount({ actor = null, id } = {}) {
  const target = await prisma.staffUser.findUnique({ where: { id } });
  if (!target) {
    return { ok: false, error: "That staff account no longer exists." };
  }
  const allowed = evaluateStaffChange({
    actorId: actor?.id,
    target,
    change: { delete: true },
    activeSuperAdmins: await countActiveSuperAdmins(),
  });
  if (!allowed.ok) return { ok: false, error: allowed.error };

  await prisma.staffUser.delete({ where: { id } });
  return { ok: true };
}
