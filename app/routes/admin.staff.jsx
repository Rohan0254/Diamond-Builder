import { Form, useActionData, useLoaderData } from "react-router";
import prisma from "../db.server";
import {
  countActiveSuperAdmins,
  createStaffAccount,
  deleteStaffAccount,
  requireStaff,
  resetStaffPassword,
  updateStaffAccount,
} from "../admin-auth.server";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES } from "../lib/admin/roles";
import { formatDateTime, formatNumber, initials } from "../lib/admin/format";

// Staff & roles for the super admin panel: `/admin/staff`.
//
// Only Super Admins reach this page (`staff:manage`). Creating, editing,
// resetting a password and deleting all go through `admin-auth.server.js`, which
// enforces the lock-out rules (an actor cannot disable or demote themselves, and
// at least one active Super Admin always remains).

export const meta = () => [
  { title: "Staff & roles · Speed Scratcher Super Admin" },
];

function serializeAccount(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    active: account.active !== false,
    lastLoginAt: account.lastLoginAt?.toISOString?.() ?? null,
    createdAt: account.createdAt?.toISOString?.() ?? null,
    createdBy: account.createdBy ?? null,
    roleRank: STAFF_ROLES.indexOf(account.role),
  };
}

export const loader = async ({ request }) => {
  const staff = await requireStaff(request, PERMISSIONS.STAFF_MANAGE);

  const [accounts, activeSuperAdmins] = await Promise.all([
    prisma.staffUser.findMany(),
    countActiveSuperAdmins(),
  ]);

  return {
    currentStaffId: staff.id,
    activeSuperAdmins,
    staff: accounts.map(serializeAccount).sort((a, b) => {
      const byRole = a.roleRank - b.roleRank;
      return byRole !== 0 ? byRole : a.name.localeCompare(b.name);
    }),
  };
};

export const action = async ({ request }) => {
  const staff = await requireStaff(request, PERMISSIONS.STAFF_MANAGE);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const result = await createStaffAccount({
      actor: staff,
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
      password: form.get("password"),
    });
    if (!result.ok) {
      return {
        intent,
        error: result.error ?? "Please fix the highlighted fields.",
        fieldErrors: result.fieldErrors ?? null,
        values: result.values ?? null,
      };
    }
    return {
      intent,
      ok: true,
      message: `Created the account for ${result.user.email}.`,
    };
  }

  if (intent === "update") {
    const result = await updateStaffAccount({
      actor: staff,
      id: String(form.get("id") ?? ""),
      name: form.get("name"),
      role: form.get("role"),
      active: form.get("active"),
    });
    if (!result.ok) {
      return {
        intent,
        error: result.error ?? "Please fix the highlighted fields.",
        fieldErrors: result.fieldErrors ?? null,
      };
    }
    return { intent, ok: true, message: `Saved ${result.user.email}.` };
  }

  if (intent === "reset-password") {
    const result = await resetStaffPassword({
      id: String(form.get("id") ?? ""),
      password: form.get("password"),
    });
    if (!result.ok) {
      return { intent, error: result.error ?? "Could not set that password." };
    }
    return { intent, ok: true, message: "Password updated." };
  }

  if (intent === "delete") {
    const result = await deleteStaffAccount({
      actor: staff,
      id: String(form.get("id") ?? ""),
    });
    if (!result.ok) {
      return { intent, error: result.error ?? "Could not delete that account." };
    }
    return { intent, ok: true, message: "Staff account deleted." };
  }

  return { error: "Unknown action." };
};

export default function AdminStaff() {
  const { currentStaffId, activeSuperAdmins, staff } = useLoaderData();
  const actionData = useActionData();

  const roleOptions = STAFF_ROLES.map((role) => (
    <option key={role} value={role}>
      {ROLE_LABELS[role]}
    </option>
  ));

  return (
    <>
      <header className="sa-topbar">
        <div>
          <h1 className="sa-title">Staff &amp; roles</h1>
          <p className="sa-subtitle">
            {formatNumber(staff.length)} staff accounts ·{" "}
            {formatNumber(activeSuperAdmins)} active Super Admin
            {activeSuperAdmins === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {actionData?.error ? (
        <div className="sa-banner sa-banner--critical" role="alert">
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok ? (
        <div className="sa-banner sa-banner--positive" role="status">
          {actionData.message}
        </div>
      ) : null}

      <section className="sa-card" aria-labelledby="sa-add-staff">
        <div className="sa-card__header">
          <h2 className="sa-card__title" id="sa-add-staff">
            Add a staff account
          </h2>
        </div>

        <Form method="post" className="sa-filters">
          <input type="hidden" name="intent" value="create" />

          <label className="sa-field" style={{ flex: "1 1 200px" }}>
            <span className="sa-field__label">Name</span>
            <input
              className={`sa-input${
                actionData?.fieldErrors?.name ? " sa-input--invalid" : ""
              }`}
              name="name"
              required
              defaultValue={actionData?.values?.name ?? ""}
            />
            {actionData?.fieldErrors?.name ? (
              <span className="sa-field__error">
                {actionData.fieldErrors.name}
              </span>
            ) : null}
          </label>

          <label className="sa-field" style={{ flex: "1 1 240px" }}>
            <span className="sa-field__label">Email</span>
            <input
              className={`sa-input${
                actionData?.fieldErrors?.email ? " sa-input--invalid" : ""
              }`}
              type="email"
              name="email"
              autoComplete="off"
              required
              defaultValue={actionData?.values?.email ?? ""}
            />
            {actionData?.fieldErrors?.email ? (
              <span className="sa-field__error">
                {actionData.fieldErrors.email}
              </span>
            ) : null}
          </label>

          <label className="sa-field">
            <span className="sa-field__label">Role</span>
            <select
              className="sa-select"
              name="role"
              defaultValue={actionData?.values?.role ?? "VIEWER"}
            >
              {roleOptions}
            </select>
          </label>

          <label className="sa-field">
            <span className="sa-field__label">Temporary password</span>
            <input
              className={`sa-input${
                actionData?.fieldErrors?.password ? " sa-input--invalid" : ""
              }`}
              type="password"
              name="password"
              autoComplete="new-password"
              required
            />
            {actionData?.fieldErrors?.password ? (
              <span className="sa-field__error">
                {actionData.fieldErrors.password}
              </span>
            ) : (
              <span className="sa-field__hint">
                At least 10 characters, mixing letters and numbers.
              </span>
            )}
          </label>

          <button type="submit" className="sa-button sa-button--primary">
            Create account
          </button>
        </Form>

        <ul className="sa-list" style={{ marginTop: 14 }}>
          {STAFF_ROLES.map((role) => (
            <li key={role} className="sa-list__item">
              <span className="sa-badge sa-badge--neutral">
                {ROLE_LABELS[role]}
              </span>
              <span className="sa-list__meta" style={{ flex: 1 }}>
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sa-card" aria-labelledby="sa-staff-title">
        <div className="sa-card__header">
          <h2 className="sa-card__title" id="sa-staff-title">
            Accounts
          </h2>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sa-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last sign-in (UTC)</th>
                <th scope="col">Manage</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((account) => {
                const isSelf = account.id === currentStaffId;
                return (
                  <tr key={account.id}>
                    <td>
                      <span className="sa-row sa-nowrap">
                        <span className="sa-user__avatar">
                          {initials(account.name, account.email)}
                        </span>
                        {account.name}
                        {isSelf ? (
                          <span className="sa-badge sa-badge--info">You</span>
                        ) : null}
                      </span>
                    </td>
                    <td>{account.email}</td>
                    <td>
                      <span className="sa-badge sa-badge--neutral">
                        {ROLE_LABELS[account.role] ?? account.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`sa-badge sa-badge--${
                          account.active ? "positive" : "critical"
                        }`}
                      >
                        {account.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="sa-nowrap sa-muted">
                      {formatDateTime(account.lastLoginAt) || "Never"}
                    </td>
                    <td>
                      <details className="sa-details">
                        <summary>Edit</summary>
                        <div className="sa-details__body">
                          <Form method="post" className="sa-stack">
                            <input type="hidden" name="intent" value="update" />
                            <input type="hidden" name="id" value={account.id} />
                            <label className="sa-field">
                              <span className="sa-field__label">Name</span>
                              <input
                                className="sa-input"
                                name="name"
                                defaultValue={account.name}
                                required
                              />
                            </label>
                            <label className="sa-field">
                              <span className="sa-field__label">Role</span>
                              <select
                                className="sa-select"
                                name="role"
                                defaultValue={account.role}
                              >
                                {roleOptions}
                              </select>
                            </label>
                            <label className="sa-row">
                              <input
                                type="checkbox"
                                name="active"
                                defaultChecked={account.active}
                              />
                              <span>Account active</span>
                            </label>
                            <button
                              type="submit"
                              className="sa-button sa-button--primary"
                            >
                              Save changes
                            </button>
                          </Form>

                          <Form
                            method="post"
                            className="sa-stack"
                            onSubmit={(event) => {
                              const input = event.currentTarget.elements.password;
                              if (input && !input.value) {
                                event.preventDefault();
                                input.focus();
                              }
                            }}
                          >
                            <input
                              type="hidden"
                              name="intent"
                              value="reset-password"
                            />
                            <input type="hidden" name="id" value={account.id} />
                            <label className="sa-field">
                              <span className="sa-field__label">
                                Set a new password
                              </span>
                              <input
                                className="sa-input"
                                type="password"
                                name="password"
                                autoComplete="new-password"
                                placeholder="At least 10 characters"
                              />
                            </label>
                            <button type="submit" className="sa-button">
                              Reset password
                            </button>
                          </Form>

                          {isSelf ? null : (
                            <Form
                              method="post"
                              onSubmit={(event) => {
                                if (
                                  !window.confirm(
                                    `Delete ${account.email}? This cannot be undone.`,
                                  )
                                ) {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="intent" value="delete" />
                              <input
                                type="hidden"
                                name="id"
                                value={account.id}
                              />
                              <button
                                type="submit"
                                className="sa-button sa-button--critical"
                              >
                                Delete account
                              </button>
                            </Form>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
