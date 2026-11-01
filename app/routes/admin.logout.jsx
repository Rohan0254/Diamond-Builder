import { Form, redirect } from "react-router";
import { destroyStaffSessionCookie } from "../admin-auth.server";

// Sign-out endpoint for the super admin panel. A dedicated route (rather than an
// action on the layout) keeps the POST unambiguous: it always destroys the
// session cookie and returns to the sign-in page.

export const loader = () => redirect("/admin");

export const action = async ({ request }) => {
  return redirect("/admin/login", {
    headers: { "Set-Cookie": await destroyStaffSessionCookie(request) },
  });
};

/** A plain GET has nothing to submit; render nothing if this ever renders. */
export default function AdminLogout() {
  return (
    <div className="sa-card">
      <p className="sa-card__hint">Signing out…</p>
      <Form method="post">
        <button type="submit" className="sa-button">
          Sign out
        </button>
      </Form>
    </div>
  );
}
