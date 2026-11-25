import { Link, useLoaderData } from "react-router";
import prisma from "../db.server";
import { requireStaff } from "../admin-auth.server";
import { PERMISSIONS } from "../lib/admin/roles";
import { INSTALL_STATUS_LABELS } from "../lib/admin/installs";
import { TICKET_STATUS_LABELS, TICKET_STATUS_TONES } from "../lib/support";
import { formatNumber, formatRelativeTime } from "../lib/admin/format";
import {
  ensureInstallBackfill,
  getInstallStats,
  listRecentInstallations,
} from "../installs.server";
import AdminIcon from "../components/admin/AdminIcon.jsx";

export const meta = () => [{ title: "Dashboard · Diamond Builder Super Admin" }];

function serializeInstall(row) {
  return {
    id: row.id,
    shop: row.shop,
    status: row.status,
    at: (row.lastEventAt ?? row.installedAt ?? row.createdAt)?.toISOString?.() ?? null,
    name: row.name ?? null,
  };
}

function serializeTicket(ticket) {
  return {
    id: ticket.id,
    ticketId: ticket.ticketId,
    shop: ticket.shop,
    name: ticket.name,
    status: ticket.status,
    createdAt: ticket.createdAt?.toISOString?.() ?? null,
  };
}

export const loader = async ({ request }) => {
  await requireStaff(request, PERMISSIONS.DASHBOARD_VIEW);

  // Shops that installed before tracking existed are folded in on first load.
  await ensureInstallBackfill();

  const [
    installStats,
    recentInstalls,
    ticketTotal,
    ticketsOpen,
    ticketsInProgress,
    recentTickets,
  ] = await Promise.all([
    getInstallStats(),
    listRecentInstallations(8),
    prisma.supportTicket.count(),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
    prisma.supportTicket.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return {
    installStats,
    recentInstalls: recentInstalls.map(serializeInstall),
    tickets: {
      total: ticketTotal,
      open: ticketsOpen,
      inProgress: ticketsInProgress,
      unresolved: ticketsOpen + ticketsInProgress,
    },
    recentTickets: recentTickets.map(serializeTicket),
  };
};

export default function AdminDashboard() {
  const { installStats, recentInstalls, tickets, recentTickets } = useLoaderData();

  return (
    <>
      <header className="sa-topbar">
        <div>
          <h1 className="sa-title">Dashboard</h1>
          <p className="sa-subtitle">
            Installations and merchant support at a glance.
          </p>
        </div>
      </header>

      <section className="sa-metrics" aria-label="Key metrics">
        <Link className="sa-metric" to="/admin/shops">
          <span className="sa-metric__top">
            <span className="sa-metric__label">App installed</span>
            <span className="sa-metric__icon">
              <AdminIcon name="shops" size={20} />
            </span>
          </span>
          <span className="sa-metric__value">
            {formatNumber(installStats.installed)}
          </span>
          <span className="sa-metric__foot">
            {installStats.installedThisWeek > 0
              ? `+${formatNumber(installStats.installedThisWeek)} this week`
              : "No new installs this week"}
            {" · "}
            {formatNumber(installStats.uninstalled)} uninstalled
          </span>
        </Link>

        <Link className="sa-metric sa-metric--warning" to="/admin/tickets">
          <span className="sa-metric__top">
            <span className="sa-metric__label">Support tickets</span>
            <span className="sa-metric__icon">
              <AdminIcon name="tickets" size={20} />
            </span>
          </span>
          <span className="sa-metric__value">{formatNumber(tickets.total)}</span>
          <span className="sa-metric__foot">
            {tickets.unresolved > 0
              ? `${formatNumber(tickets.unresolved)} awaiting reply`
              : "Everything handled"}
          </span>
        </Link>
      </section>

      <section className="sa-card" aria-labelledby="sa-recent-installs">
        <div className="sa-card__header">
          <h2 className="sa-card__title" id="sa-recent-installs">
            Recent install activity
          </h2>
          <Link className="sa-card__hint" to="/admin/shops">
            View all shops →
          </Link>
        </div>

        {recentInstalls.length === 0 ? (
          <p className="sa-empty">No install or uninstall activity recorded yet.</p>
        ) : (
          <ul className="sa-list">
            {recentInstalls.map((row) => (
              <li key={row.id} className="sa-list__item">
                <span>
                  <span className="sa-mono">{row.shop}</span>
                  {row.name ? (
                    <span className="sa-muted"> · {row.name}</span>
                  ) : null}
                </span>
                <span className="sa-row sa-nowrap">
                  <span
                    className={`sa-badge sa-badge--${
                      row.status === "INSTALLED" ? "positive" : "critical"
                    }`}
                  >
                    {INSTALL_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="sa-list__meta">
                    {formatRelativeTime(row.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sa-card" aria-labelledby="sa-recent-tickets">
        <div className="sa-card__header">
          <h2 className="sa-card__title" id="sa-recent-tickets">
            Latest support tickets
          </h2>
          <Link className="sa-card__hint" to="/admin/tickets">
            View all tickets →
          </Link>
        </div>

        {recentTickets.length === 0 ? (
          <p className="sa-empty">No support tickets have been submitted.</p>
        ) : (
          <ul className="sa-list">
            {recentTickets.map((ticket) => (
              <li key={ticket.id} className="sa-list__item">
                <span>
                  <span className="sa-primary">{ticket.name}</span>
                  <span className="sa-muted"> · {ticket.shop}</span>
                </span>
                <span className="sa-row sa-nowrap">
                  <span
                    className={`sa-badge sa-badge--${
                      TICKET_STATUS_TONES[ticket.status] ?? "neutral"
                    }`}
                  >
                    {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                  </span>
                  <span className="sa-list__meta">
                    {formatRelativeTime(ticket.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
