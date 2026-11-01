import { Form, Link, useLoaderData } from "react-router";
import { requireStaff } from "../admin-auth.server";
import { PERMISSIONS } from "../lib/admin/roles";
import {
  INSTALL_STATUS_LABELS,
  SHOP_EVENT_LABELS,
  SHOP_EVENT_TONES,
  describeFilters,
  readFilters,
} from "../lib/admin/installs";
import { formatDateTime, formatNumber } from "../lib/admin/format";
import {
  ensureInstallBackfill,
  getInstallStats,
  listInstallations,
  listShopEvents,
} from "../installs.server";

// Installed apps + lifecycle log for the super admin panel: `/admin/shops`.
//
// Two tables share one GET filter set (status / search / date range): the current
// state of every shop, and the append-only install/uninstall history. Both are
// paginated independently, and the filters live in the URL so a view can be
// bookmarked or shared.

export const meta = () => [
  { title: "Installed apps · Diamond Builder Super Admin" },
];

const PAGE_SIZE = 25;

function serializeInstallation(row) {
  return {
    id: row.id,
    shop: row.shop,
    name: row.name ?? null,
    email: row.email ?? null,
    status: row.status,
    installedAt: row.installedAt?.toISOString?.() ?? null,
    uninstalledAt: row.uninstalledAt?.toISOString?.() ?? null,
    reinstallCount: row.reinstallCount ?? 0,
  };
}

function serializeEvent(row) {
  return {
    id: row.id,
    shop: row.shop,
    type: row.type,
    name: row.name ?? null,
    email: row.email ?? null,
    detail: row.detail ?? null,
    at: row.at?.toISOString?.() ?? null,
  };
}

/** Builds a `/admin/shops` URL that preserves filters and both page numbers. */
function shopsUrl(filters, { page = 1, logPage = 1 } = {}) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.search) params.set("q", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  if (logPage > 1) params.set("logPage", String(logPage));
  const query = params.toString();
  return query ? `/admin/shops?${query}` : "/admin/shops";
}

export const loader = async ({ request }) => {
  await requireStaff(request, PERMISSIONS.SHOPS_VIEW);

  // Shops that installed before tracking existed are folded in on first load.
  await ensureInstallBackfill();

  const url = new URL(request.url);
  const filters = readFilters(url.searchParams);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const logPage = Math.max(1, Number(url.searchParams.get("logPage")) || 1);

  const [stats, shops, events] = await Promise.all([
    getInstallStats(),
    listInstallations({ filters, page, pageSize: PAGE_SIZE }),
    listShopEvents({ filters, page: logPage, pageSize: PAGE_SIZE }),
  ]);

  return {
    filters,
    filterSummary: describeFilters(filters),
    stats,
    shops: {
      rows: shops.rows.map(serializeInstallation),
      total: shops.total,
      page,
      pageCount: Math.max(1, Math.ceil(shops.total / PAGE_SIZE)),
    },
    log: {
      rows: events.rows.map(serializeEvent),
      total: events.total,
      page: logPage,
      pageCount: Math.max(1, Math.ceil(events.total / PAGE_SIZE)),
    },
  };
};

/** Pager for one of the two tables; `other` carries the sibling's page number. */
function Pager({ label, filters, page, pageCount, other }) {
  if (pageCount <= 1) return null;
  return (
    <div className="sa-pagination">
      <span className="sa-list__meta">
        {label} · page {formatNumber(page)} of {formatNumber(pageCount)}
      </span>
      <span className="sa-row">
        {page > 1 ? (
          <Link className="sa-button" to={other({ ...filters }, page - 1)}>
            ← Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link className="sa-button" to={other({ ...filters }, page + 1)}>
            Next →
          </Link>
        ) : null}
      </span>
    </div>
  );
}

export default function AdminShops() {
  const { filters, filterSummary, stats, shops, log } = useLoaderData();

  return (
    <>
      <header className="sa-topbar">
        <div>
          <h1 className="sa-title">Installed apps</h1>
          <p className="sa-subtitle">
            {formatNumber(stats.installed)} installed ·{" "}
            {formatNumber(stats.uninstalled)} uninstalled ·{" "}
            {formatNumber(stats.reinstalls)} reinstalled
          </p>
        </div>
      </header>

      <section className="sa-card">
        <Form method="get" className="sa-filters">
          <label className="sa-field">
            <span className="sa-field__label">Status</span>
            <select
              className="sa-select"
              name="status"
              defaultValue={filters.status}
            >
              <option value="all">All shops</option>
              <option value="installed">Installed</option>
              <option value="uninstalled">Uninstalled</option>
            </select>
          </label>

          <label className="sa-field" style={{ flex: "1 1 240px" }}>
            <span className="sa-field__label">Search</span>
            <input
              className="sa-input"
              type="search"
              name="q"
              placeholder="Shop domain, store name or owner email"
              defaultValue={filters.search}
            />
          </label>

          <label className="sa-field">
            <span className="sa-field__label">Last event from</span>
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
          <Link className="sa-button" to="/admin/shops">
            Reset
          </Link>
        </Form>
      </section>

      <section className="sa-card" aria-labelledby="sa-shops-title">
        <div className="sa-card__header">
          <div>
            <h2 className="sa-card__title" id="sa-shops-title">
              Shops
            </h2>
            <p className="sa-card__hint">{filterSummary}</p>
          </div>
          <span className="sa-card__hint">
            {formatNumber(shops.total)} matching
          </span>
        </div>

        {shops.rows.length === 0 ? (
          <p className="sa-empty">No shops match these filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">Shop</th>
                  <th scope="col">Store</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Installed (UTC)</th>
                  <th scope="col">Uninstalled (UTC)</th>
                  <th scope="col">Reinstalls</th>
                </tr>
              </thead>
              <tbody>
                {shops.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="sa-mono sa-nowrap">{row.shop}</td>
                    <td>{row.name || <span className="sa-muted">—</span>}</td>
                    <td>
                      {row.email ? (
                        <a href={`mailto:${row.email}`}>{row.email}</a>
                      ) : (
                        <span className="sa-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`sa-badge sa-badge--${
                          row.status === "INSTALLED" ? "positive" : "critical"
                        }`}
                      >
                        {INSTALL_STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="sa-nowrap sa-muted">
                      {formatDateTime(row.installedAt)}
                    </td>
                    <td className="sa-nowrap sa-muted">
                      {formatDateTime(row.uninstalledAt) || "—"}
                    </td>
                    <td>{formatNumber(row.reinstallCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          label="Shops"
          filters={filters}
          page={shops.page}
          pageCount={shops.pageCount}
          other={(nextFilters, nextPage) =>
            shopsUrl(nextFilters, { page: nextPage, logPage: log.page })
          }
        />
      </section>

      <section className="sa-card" aria-labelledby="sa-log-title">
        <div className="sa-card__header">
          <div>
            <h2 className="sa-card__title" id="sa-log-title">
              Install log
            </h2>
            <p className="sa-card__hint">
              Every install, reinstall and uninstall, newest first. Times are UTC.
            </p>
          </div>
          <span className="sa-card__hint">
            {formatNumber(log.total)} events
          </span>
        </div>

        {log.rows.length === 0 ? (
          <p className="sa-empty">No lifecycle events match these filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">When (UTC)</th>
                  <th scope="col">Event</th>
                  <th scope="col">Shop</th>
                  <th scope="col">Store</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {log.rows.map((event) => (
                  <tr key={event.id}>
                    <td className="sa-nowrap sa-muted">
                      {formatDateTime(event.at)}
                    </td>
                    <td>
                      <span
                        className={`sa-badge sa-badge--${
                          SHOP_EVENT_TONES[event.type] ?? "neutral"
                        }`}
                      >
                        {SHOP_EVENT_LABELS[event.type] ?? event.type}
                      </span>
                    </td>
                    <td className="sa-mono sa-nowrap">{event.shop}</td>
                    <td>
                      {event.name || event.email || (
                        <span className="sa-muted">—</span>
                      )}
                    </td>
                    <td className="sa-muted">{event.detail || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          label="Log"
          filters={filters}
          page={log.page}
          pageCount={log.pageCount}
          other={(nextFilters, nextPage) =>
            shopsUrl(nextFilters, { page: shops.page, logPage: nextPage })
          }
        />
      </section>
    </>
  );
}
