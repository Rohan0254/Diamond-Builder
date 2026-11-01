import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import {
  countStaffAccounts,
  createStaffSessionCookie,
  ensureSeedSuperAdmin,
  getStaffSession,
  signInStaff,
} from "../admin-auth.server";
import { ADMIN_CSS } from "../lib/admin/styles";

// Sign-in page for the super admin panel: `/admin/login`.
//
// The trailing underscore in the file name makes this route *escape* the
// `admin.jsx` layout (React Router flat routes), so the sign-in page is not
// wrapped in the authenticated sidebar shell.
//
// The first Super Admin is seeded from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
// while the staff collection is still empty (see `ensureSeedSuperAdmin`), which is
// what makes a fresh deployment reachable without a separate setup screen.

/** A safe post-login destination: only paths inside the panel. */
function resolveNext(value) {
  if (typeof value !== "string") return "/admin";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/admin")) return "/admin";
  if (trimmed.startsWith("//")) return "/admin";
  if (trimmed === "/admin/login" || trimmed.startsWith("/admin/login?")) {
    return "/admin";
  }
  return trimmed;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const next = resolveNext(url.searchParams.get("next"));

  const staff = await getStaffSession(request);
  if (staff) throw redirect(next);

  let staffCount = 0;
  let seedReason = null;
  try {
    staffCount = await countStaffAccounts();
    if (staffCount === 0) {
      const seed = await ensureSeedSuperAdmin();
      if (seed.created) {
        staffCount = 1;
      } else {
        seedReason = seed.reason;
      }
    }
  } catch (error) {
    console.error("[admin.login] could not prepare the super admin account", error);
  }

  return { next, needsSetup: staffCount === 0, seedReason };
}

export const action = async ({ request }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = resolveNext(String(form.get("next") ?? ""));

  // Make sure the very first sign-in can succeed on a fresh deployment.
  try {
    if ((await countStaffAccounts()) === 0) {
      await ensureSeedSuperAdmin();
    }
  } catch (error) {
    console.error("[admin.login] could not seed the first super admin", error);
  }

  let result;
  try {
    result = await signInStaff({ email, password });
  } catch (error) {
    console.error("[admin.login] sign-in failed", error);
    return { error: "Could not sign in right now. Please try again.", email };
  }

  if (!result.ok) {
    return { error: result.error, email };
  }

  return redirect(next, {
    headers: { "Set-Cookie": await createStaffSessionCookie(result.user) },
  });
};

export default function AdminLogin() {
  const { next, needsSetup } = useLoaderData();
  const actionData = useActionData();
  const [email, setEmail] = useState(actionData?.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <div className="sa-login">
      <style>{ADMIN_CSS}</style>
      <div className="sa-login__card">
        <div className="sa-login__brand">
          <span className="sa-brand__mark">SS</span>
          <span className="sa-brand__text">
            <span className="sa-brand__title">Diamond Builder</span>
            <span className="sa-brand__subtitle">Super admin</span>
          </span>
        </div>

        <h1 className="sa-login__title">Sign in</h1>
        <p className="sa-login__hint">
          Staff accounts only. Merchant accounts are unaffected.
        </p>

        {needsSetup ? (
          <div className="sa-banner sa-banner--warning" role="status">
            <span className="sa-banner__title">No staff account exists yet</span>
            <span>
              Set <code>SUPER_ADMIN_EMAIL</code> and{" "}
              <code>SUPER_ADMIN_PASSWORD</code> in the server environment, then
              reload this page. The first account is created from those values
              automatically.
            </span>
          </div>
        ) : null}

        {actionData?.error ? (
          <div className="sa-banner sa-banner--critical" role="alert">
            {actionData.error}
          </div>
        ) : null}

        <Form method="post" replace>
          <input type="hidden" name="next" value={next} />
          <div className="sa-stack">
            <label className="sa-field">
              <span className="sa-field__label">Email address</span>
              <input
                className="sa-input"
                type="email"
                name="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="sa-field">
              <span className="sa-field__label">Password</span>
              <input
                className="sa-input"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <button type="submit" className="sa-button sa-button--primary">
              Sign in
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
