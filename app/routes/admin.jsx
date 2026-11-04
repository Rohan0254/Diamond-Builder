import { Fragment } from "react";
import { Form, Link, Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from "react-router";
import { requireStaff, serializeStaff } from "../admin-auth.server";
import { PERMISSIONS, hasPermission } from "../lib/admin/roles";
import { ADMIN_CSS } from "../lib/admin/styles";
import { initials } from "../lib/admin/format";
import AdminIcon from "../components/admin/AdminIcon.jsx";

// Layout for the super admin panel (`/admin`).
//
// This route sits outside the embedded Shopify app: it has its own sign-in page
// (see `admin_.login.jsx`, which deliberately escapes this layout) and its own
// staff roles. The loader runs before every child route and is the single place
// the session is checked; a child route only adds the permission it needs.
//
// The nav is filtered by the signed-in role, so a Support or Viewer account never
// sees a link it would be refused at.

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: "dashboard",
    permission: PERMISSIONS.DASHBOARD_VIEW,
    exact: true,
  },
  {
    href: "/admin/feeds/vendors",
    label: "Vendors",
    icon: "shops",
    permission: PERMISSIONS.DASHBOARD_VIEW,
    heading: "Feeds",
  },
  {
    href: "/admin/feeds/diamonds",
    label: "Diamonds",
    icon: "dashboard",
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    heading: "Manage",
    href: "/admin/shops",
    label: "App installed",
    icon: "shops",
    permission: PERMISSIONS.SHOPS_VIEW,
  },
  {
    href: "/admin/tickets",
    label: "Support tickets",
    icon: "tickets",
    permission: PERMISSIONS.TICKETS_VIEW,
  },
  {
    href: "/admin/staff",
    label: "Staff & roles",
    icon: "staff",
    permission: PERMISSIONS.STAFF_MANAGE,
  },
];

function isActivePath(item, pathname) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const loader = async ({ request }) => {
  const staff = await requireStaff(request);
  return { staff: serializeStaff(staff) };
};

export default function AdminLayout() {
  const { staff } = useLoaderData();
  const location = useLocation();

  return (
    <div className="sa-shell">
      <style>{ADMIN_CSS}</style>

      <aside className="sa-sidebar">
        <Link className="sa-brand" to="/admin">
          <span className="sa-brand__mark">SS</span>
          <span className="sa-brand__text">
            <span className="sa-brand__title">Diamond Builder</span>
            <span className="sa-brand__subtitle">Super admin</span>
          </span>
        </Link>

        <nav className="sa-nav" aria-label="Super admin sections">
          {NAV_ITEMS.filter((item) =>
            hasPermission(staff.role, item.permission),
          ).map((item) => {
            const active = isActivePath(item, location.pathname);
            return (
              <Fragment key={item.href}>
                {item.heading && <p className="sa-nav__heading">{item.heading}</p>}
              <Link
                to={item.href}
                className={`sa-nav__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="sa-nav__icon">
                  <AdminIcon name={item.icon} />
                </span>
                {item.label}
              </Link>
              </Fragment>
            );
          })}
        </nav>

        <div className="sa-sidebar__footer">
          <div className="sa-user">
            <span className="sa-user__avatar">
              {initials(staff.name, staff.email)}
            </span>
            <span className="sa-user__meta">
              <span className="sa-user__name">{staff.name}</span>
              <span className="sa-user__role">{staff.roleLabel}</span>
            </span>
          </div>
          <Form method="post" action="/admin/logout">
            <button type="submit" className="sa-button" style={{ width: "100%" }}>
              <AdminIcon name="logout" size={16} />
              Sign out
            </button>
          </Form>
        </div>
      </aside>

      <main className="sa-main">
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const forbidden = isRouteErrorResponse(error) && error.status === 403;

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
        <h1 className="sa-login__title">
          {forbidden ? "Access denied" : "Something went wrong"}
        </h1>
        <p className="sa-login__hint">
          {forbidden
            ? "Your staff role does not include this section. Ask a Super Admin if you need access."
            : "The panel could not load that section. Try again, or sign in again if this keeps happening."}
        </p>
        <div className="sa-row">
          <Link className="sa-button" to="/admin">
            Back to dashboard
          </Link>
          <Link className="sa-button" to="/admin/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
