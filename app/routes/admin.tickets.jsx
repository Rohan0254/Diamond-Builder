import { Form, Link, useActionData, useLoaderData } from "react-router";
import prisma from "../db.server";
import { requireStaff } from "../admin-auth.server";
import { PERMISSIONS } from "../lib/admin/roles";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONES,
  normalizeTicketStatus,
} from "../lib/support";
import {
  buildTicketWhere,
  describeTicketFilters,
  readTicketFilters,
} from "../lib/admin/tickets";
import { formatDateTime, formatNumber, truncate } from "../lib/admin/format";

// Support tickets for the super admin panel: `/admin/tickets`.
//
// Lists every ticket merchants submitted from the app's Help page, filterable by
// status, shop/text and date. Staff with `tickets:manage` can move a ticket
// through OPEN → IN_PROGRESS → RESOLVED → CLOSED; everyone else sees the list
// read-only.

export const meta = () => [
  { title: "Support tickets · Speed Scratcher Super Admin" },
];

const PAGE_SIZE = 25;

function serializeTicket(ticket) {
  return {
    id: ticket.id,
    ticketId: ticket.ticketId,
    shop: ticket.shop,
    name: ticket.name,
    email: ticket.email,
    message: ticket.message,
    status: ticket.status,
    createdAt: ticket.createdAt?.toISOString?.() ?? null,
    updatedAt: ticket.updatedAt?.toISOString?.() ?? null,
  };
}

/** Builds a `/admin/tickets` URL that preserves the active filters. */
function ticketsUrl(filters, { status, page = 1 } = {}) {
  const params = new URLSearchParams();
  const nextStatus = status ?? filters.status;
  if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
  if (filters.search) params.set("q", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/tickets?${query}` : "/admin/tickets";
}

export const loader = async ({ request }) => {
  const staff = await requireStaff(request, PERMISSIONS.TICKETS_VIEW);

  const url = new URL(request.url);
  const filters = readTicketFilters(url.searchParams);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const where = buildTicketWhere(filters);

  const [tickets, total, ...statusCounts] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.supportTicket.count({ where }),
    ...TICKET_STATUSES.map((status) =>
      prisma.supportTicket.count({ where: { status } }),
    ),
  ]);

  const counts = Object.fromEntries(
    TICKET_STATUSES.map((status, index) => [status, statusCounts[index]]),
  );

  return {
    filters,
    filterSummary: describeTicketFilters(filters),
    canManage: hasManagePermission(staff),
    counts: {
      ...counts,
      all: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
    tickets: tickets.map(serializeTicket),
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  };
};

function hasManagePermission(staff) {
  return staff.permissions?.includes(PERMISSIONS.TICKETS_MANAGE) ?? false;
}

export const action = async ({ request }) => {
  const staff = await requireStaff(request, PERMISSIONS.TICKETS_MANAGE);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent !== "update-status") {
    return { error: "Unknown action." };
  }

  const id = String(form.get("id") ?? "");
  const status = normalizeTicketStatus(form.get("status"));
  if (!id || !status) {
    return { error: "Choose a valid ticket status." };
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) {
    return { error: "That ticket no longer exists." };
  }

  if (ticket.status === status) {
    return { ok: true, message: `Ticket ${ticket.ticketId} is already ${TICKET_STATUS_LABELS[status]}.` };
  }

  await prisma.supportTicket.update({ where: { id }, data: { status } });
  console.info(
    `[admin] ${staff.email} moved ticket ${ticket.ticketId} to ${status}`,
  );

  return {
    ok: true,
    message: `Ticket ${ticket.ticketId} moved to ${TICKET_STATUS_LABELS[status]}.`,
  };
};

function StatusTabs({ filters, counts, active }) {
  const tabs = [
    { key: "all", label: "All", count: counts.all },
    ...TICKET_STATUSES.map((status) => ({
      key: status,
      label: TICKET_STATUS_LABELS[status],
      count: counts[status] ?? 0,
    })),
  ];

  return (
    <div className="sa-row" role="tablist" aria-label="Filter by status">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={ticketsUrl(filters, { status: tab.key, page: 1 })}
          className={`sa-badge sa-badge--${
            active === tab.key
              ? TICKET_STATUS_TONES[tab.key] ?? "positive"
              : "neutral"
          }`}
          aria-current={active === tab.key ? "true" : undefined}
        >
          {tab.label} · {formatNumber(tab.count)}
        </Link>
      ))}
    </div>
  );
}

export default function AdminTickets() {
  const { filters, filterSummary, canManage, counts, tickets, page, pageCount, total } =
    useLoaderData();
  const actionData = useActionData();

  return (
    <>
      <header className="sa-topbar">
        <div>
          <h1 className="sa-title">Support tickets</h1>
          <p className="sa-subtitle">
            Every ticket submitted from the app, newest first.
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

      <section className="sa-card">
        <StatusTabs filters={filters} counts={counts} active={filters.status} />

        <Form method="get" className="sa-filters" style={{ marginTop: 14 }}>
          <input type="hidden" name="status" value={filters.status} />
          <label className="sa-field" style={{ flex: "1 1 260px" }}>
            <span className="sa-field__label">Search</span>
            <input
              className="sa-input"
              type="search"
              name="q"
              placeholder="Ticket, shop, name, email or message"
              defaultValue={filters.search}
            />
          </label>
          <label className="sa-field">
            <span className="sa-field__label">From</span>
            <input
              className="sa-input"
              type="date"
              name="from"
              defaultValue={filters.from}
            />
          </label>
          <label className="sa-field">
            <span className="sa-field__label">Until</span>
            <input
              className="sa-input"
              type="date"
              name="to"
              defaultValue={filters.to}
            />
          </label>
          <button type="submit" className="sa-button sa-button--primary">
            Apply filters
          </button>
          <Link className="sa-button" to="/admin/tickets">
            Reset
          </Link>
        </Form>
      </section>

      <section className="sa-card" aria-labelledby="sa-tickets-title">
        <div className="sa-card__header">
          <div>
            <h2 className="sa-card__title" id="sa-tickets-title">
              Tickets
            </h2>
            <p className="sa-card__hint">{filterSummary}</p>
          </div>
          <span className="sa-card__hint">{formatNumber(total)} matching</span>
        </div>

        {tickets.length === 0 ? (
          <p className="sa-empty">No tickets match these filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">Received (UTC)</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Shop</th>
                  <th scope="col">From</th>
                  <th scope="col">Status</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="sa-nowrap sa-muted">
                      {formatDateTime(ticket.createdAt)}
                    </td>
                    <td className="sa-mono sa-nowrap">{ticket.ticketId}</td>
                    <td className="sa-mono sa-nowrap">{ticket.shop}</td>
                    <td>
                      <span className="sa-primary">{ticket.name}</span>
                      <br />
                      <a href={`mailto:${ticket.email}`} className="sa-muted">
                        {ticket.email}
                      </a>
                    </td>
                    <td>
                      <span
                        className={`sa-badge sa-badge--${
                          TICKET_STATUS_TONES[ticket.status] ?? "neutral"
                        }`}
                      >
                        {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      <details className="sa-details">
                        <summary>{truncate(ticket.message, 70)}</summary>
                        <div className="sa-details__body">
                          <p className="sa-message">{ticket.message}</p>
                          {canManage ? (
                            <Form method="post" className="sa-row">
                              <input type="hidden" name="intent" value="update-status" />
                              <input type="hidden" name="id" value={ticket.id} />
                              <label className="sa-field">
                                <span className="sa-field__label">Set status</span>
                                <select
                                  className="sa-select"
                                  name="status"
                                  defaultValue={ticket.status}
                                >
                                  {TICKET_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {TICKET_STATUS_LABELS[status]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button type="submit" className="sa-button sa-button--primary">
                                Update status
                              </button>
                            </Form>
                          ) : null}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="sa-pagination">
          <span className="sa-list__meta">
            Page {formatNumber(page)} of {formatNumber(pageCount)}
          </span>
          <span className="sa-row">
            {page > 1 ? (
              <Link
                className="sa-button"
                to={ticketsUrl(filters, { page: page - 1 })}
              >
                ← Newer
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                className="sa-button"
                to={ticketsUrl(filters, { page: page + 1 })}
              >
                Older →
              </Link>
            ) : null}
          </span>
        </div>
      </section>
    </>
  );
}
