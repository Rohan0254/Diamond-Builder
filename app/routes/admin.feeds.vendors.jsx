import { Form, Link, redirect, useActionData, useFetcher, useLoaderData, useNavigation, useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { setImmediate } from "node:timers";
import { requireStaff } from "../admin-auth.server";
import prisma from "../db.server";
import { PERMISSIONS, hasPermission } from "../lib/admin/roles";
import { importVendorCsv } from "../vendor-import.server";
import AdminIcon from "../components/admin/AdminIcon.jsx";

/* eslint-disable react/prop-types -- route data is defined by the server loader */

const categories = ["Natural", "Lab Grown Natural", "Lab Grown Colored", "Gemstones", "Colored Diamonds"];
const feedTypes = ["Global", "User"];
const categoryClasses = {
  Natural: "is-natural",
  Gemstones: "is-gemstones",
  "Colored Diamonds": "is-colored-diamonds",
  "Lab Grown Colored": "is-lab-grown-colored",
  "Lab Grown Natural": "is-lab-grown-natural",
};
const pageSize = 25;
const objectId = /^[a-f0-9]{24}$/i;
const vendorPath = "/admin/feeds/vendors";
const vendorSortOptions = [["lastImportAt", "Last import"], ["category", "Vendor type"], ["vendorCode", "Vendor code"]];
const vendorColumns = [["category", "Vendor type"], ["vendorCode", "Vendor code"], ["diamondCount", "Diamond count"], ["lastImportAt", "Last import"], ["nextImport", "Next import"], ["enabled", "Status"]];

export async function loader({ request }) {
  const staff = await requireStaff(request, PERMISSIONS.DASHBOARD_VIEW);
  const params = new URL(request.url).searchParams;
  const filters = {
    q: (params.get("q") ?? "").trim().slice(0, 120),
    category: categories.includes(params.get("category")) ? params.get("category") : "",
    status: ["enabled", "disabled"].includes(params.get("status")) ? params.get("status") : "",
    feedType: feedTypes.includes(params.get("feedType")) ? params.get("feedType") : "",
  };
  const where = {
    ...(filters.q ? { OR: [{ name: { startsWith: filters.q } }, { vendorCode: { startsWith: filters.q } }] } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status ? { enabled: filters.status === "enabled" } : {}),
    ...(filters.feedType ? { feedType: filters.feedType } : {}),
  };
  const canManage = hasPermission(staff.role, PERMISSIONS.VENDORS_MANAGE);
  const editing = params.has("edit");
  let vendor = null;
  if (editing || params.has("view")) {
    if (editing && !canManage) throw new Response("Forbidden", { status: 403 });
    const id = params.get(editing ? "edit" : "view");
    if (!objectId.test(id)) throw new Response("Invalid vendor", { status: 400 });
    vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new Response("Vendor not found", { status: 404 });
  }
  const sort = vendorSortOptions.some(([key]) => key === params.get("sort")) ? params.get("sort") : "lastImportAt";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const after = params.get("after");
  if (after && !objectId.test(after)) throw new Response("Invalid page", { status: 400 });
  const [rows, count] = await Promise.all([prisma.vendor.findMany({ where,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    orderBy: [{ [sort]: direction }, { id: direction }],
    take: pageSize + 1,
    select: { id: true, name: true, vendorCode: true, category: true, diamondCount: true, feedType: true, enabled: true, lastImportAt: true, currentImportJobId: true },
  }), prisma.vendor.count({ where })]);
  const jobIds = rows.slice(0, pageSize).map((row) => row.currentImportJobId).filter(Boolean);
  const jobs = jobIds.length ? await prisma.diamondImport.findMany({
    where: { id: { in: jobIds } }, select: { id: true, status: true, imported: true, error: true },
  }) : [];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const vendors = rows.slice(0, pageSize).map((row) => ({ ...row, importJob: jobById.get(row.currentImportJobId) ?? null }));

  return { vendors, next: rows.length > pageSize ? rows[pageSize - 1].id : null,
    filters, count, sort, direction, after, canManage, vendor, editing, creating: canManage && params.has("create") };
}

export async function action({ request }) {
  await requireStaff(request, PERMISSIONS.VENDORS_MANAGE);
  const form = await request.formData();
  const field = (key) => String(form.get(key) ?? "").trim();
  const intent = field("intent");
  if (intent === "import") {
    const id = field("id");
    if (!objectId.test(id)) return { error: "Invalid vendor." };
    const vendor = await prisma.vendor.findUnique({ where: { id }, select: { id: true, name: true, feedUrl: true, enabled: true, sample: true, currentImportJobId: true } });
    if (!vendor) return { error: "Vendor no longer exists." };
    if (!vendor.enabled) return { error: "Enable this vendor before importing." };
    if (vendor.currentImportJobId) {
      const current = await prisma.diamondImport.findUnique({ where: { id: vendor.currentImportJobId }, select: { status: true } });
      if (current && ["PENDING", "RUNNING"].includes(current.status)) return { error: "An import is already running for this vendor." };
    }
    const job = await prisma.diamondImport.create({ data: { vendorId: id, status: "RUNNING" }, select: { id: true } });
    await prisma.vendor.update({ where: { id }, data: { currentImportJobId: job.id } });
    const isSample = vendor.sample || vendor.name.trim().toLowerCase() === "sample";
    setImmediate(() => { void importVendorCsv(id, job.id, vendor.feedUrl, isSample); });
    return { importStarted: true, vendorId: id };
  }
  const status = field("enabled");
  if (!["true", "false"].includes(status)) return { error: "Choose Enabled or Disabled." };
  const enabled = status === "true";
  if (intent === "status") {
    const id = field("id");
    if (!objectId.test(id)) return { error: "Invalid vendor." };
    const { count } = await prisma.vendor.updateMany({ where: { id }, data: { enabled } });
    return count ? { ok: true } : { error: "Vendor no longer exists." };
  }
  if (intent !== "create" && intent !== "edit") return { error: "Unknown vendor action." };
  const name = field("name"), vendorCode = field("vendorCode"), category = field("category"), feedUrl = field("feedUrl"), feedType = field("feedType");
  const sample = field("sample") === "true" || name.toLowerCase() === "sample";
  if (!name || name.length > 160) return { error: "Enter a vendor name of up to 160 characters." };
  if (!vendorCode || vendorCode.length > 64) return { error: "Enter a vendor code of up to 64 characters." };
  if (!categories.includes(category) || !feedTypes.includes(feedType)) return { error: "Choose a valid category and feed type." };
  if (!URL.canParse(feedUrl) || !["http:", "https:"].includes(new URL(feedUrl).protocol))
    return { error: "Enter an HTTP or HTTPS feed URL." };
  const data = { name, vendorCode, category, feedUrl, feedType, enabled, sample };
  if (intent === "edit") {
    const id = field("id");
    if (!objectId.test(id)) return { error: "Invalid vendor." };
    let count;
    try {
      ({ count } = await prisma.vendor.updateMany({ where: { id }, data }));
    } catch (error) {
      if (error.code === "P2002") return { error: "That vendor code is already in use." };
      throw error;
    }
    if (!count) return { error: "Vendor no longer exists." };
    return redirect(vendorPath + "?view=" + id);
  }
  try {
    await prisma.vendor.create({ data, select: { id: true } });
  } catch (error) {
    if (error.code === "P2002") return { error: "That vendor code is already in use." };
    throw error;
  }
  return redirect(vendorPath);
}

export default function VendorFeeds() {
  const { vendors, next, after, canManage, creating, vendor, editing, filters, count, sort, direction } = useLoaderData();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columns, setColumns] = useState(() => Object.fromEntries(vendorColumns.map(([key]) => [key, true])));
  const sortFields = <><input type="hidden" name="sort" value={sort} /><input type="hidden" name="direction" value={direction} /></>;
  const activeCount = [filters.category, filters.status, filters.feedType].filter(Boolean).length;
  const vendorUrl = (overrides = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, sort, direction, ...overrides })) if (value) params.set(key, value);
    return vendorPath + (params.size ? "?" + params.toString() : "");
  };
  const result = useActionData();
  const busy = useNavigation().state !== "idle";
  const revalidator = useRevalidator();
  const hasRunningImports = vendors.some((vendor) => ["PENDING", "RUNNING"].includes(vendor.importJob?.status));
  useEffect(() => {
    if (!hasRunningImports) return undefined;
    const timer = setInterval(() => revalidator.revalidate(), 2000);
    return () => clearInterval(timer);
  }, [hasRunningImports, revalidator]);
  return (
    <>
      <header className="sa-topbar">
        <div><p className="sa-subtitle">Feeds</p><h1 className="sa-title">Vendors</h1></div>
        {canManage && !creating && <Link className="sa-button sa-button--primary" to="?create">Create new vendor</Link>}
      </header>
      {result?.error && <p role="alert" className="sa-field__error">{result.error}</p>}
      {(creating || vendor) && <div className="sa-modal-backdrop">
        <section className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-modal-title">
          <header className="sa-modal__header"><div><p className="sa-modal__eyebrow">{creating ? "FEEDS / VENDORS" : editing ? "EDIT VENDOR" : "VENDOR DETAILS"}</p><h2 id="vendor-modal-title">{creating ? "Create new vendor" : editing ? "Edit vendor" : vendor.name}</h2></div><Link to={vendorPath} className="sa-modal__close" aria-label="Close dialog">×</Link></header>
      {vendor && !editing && <div className="sa-modal__body sa-vendor-view">
        <div className="sa-vendor-summary">
          <div><span className="sa-modal__eyebrow">DIAMONDS IN FEED</span><strong>{vendor.diamondCount.toLocaleString()}</strong></div>
          <span className={"sa-status-pill " + (vendor.enabled ? "is-enabled" : "is-disabled")}><i />{vendor.enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <dl className="sa-vendor-details">
          <div><dt>Vendor type</dt><dd><span className="sa-category-pill">{vendor.category}</span></dd></div>
          <div><dt>Vendor code</dt><dd>{vendor.vendorCode ?? "—"}</dd></div>
          <div><dt>Feed type</dt><dd>{vendor.feedType}</dd></div>
          <div><dt>Feed URL</dt><dd><a href={vendor.feedUrl} target="_blank" rel="noreferrer">{vendor.feedUrl}</a></dd></div>
        </dl>
        {canManage && <div className="sa-vendor-view-actions"><Link className="sa-button sa-button--primary" to={"?edit=" + vendor.id}>Edit vendor</Link></div>}
      </div>}
      {(creating || editing) && <div className="sa-modal__body">
        <Form method="post" className="sa-stack" key={vendor?.id ?? "create"}>
          <input type="hidden" name="intent" value={editing ? "edit" : "create"} />
          {editing && <input type="hidden" name="id" value={vendor.id} />}
          <label className="sa-field">Vendor name<input className="sa-input" name="name" defaultValue={vendor?.name} required maxLength={160} /></label>
          <label className="sa-field">Vendor type (category)<select className="sa-input" name="category" required defaultValue={vendor?.category ?? ""}><option value="" disabled>Select a category</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="sa-field">Vendor code<input className="sa-input" name="vendorCode" defaultValue={vendor?.vendorCode ?? ""} required maxLength={64} /></label>
          <label className="sa-field">Feed URL<input className="sa-input" type="url" name="feedUrl" defaultValue={vendor?.feedUrl} required /></label>
          <label className="sa-field">Feed type<select className="sa-input" name="feedType" defaultValue={vendor?.feedType}>{feedTypes.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="sa-field">Status<select className="sa-input" name="enabled" defaultValue={String(vendor?.enabled ?? true)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label className="sa-field">Sample vendor<select className="sa-input" name="sample" defaultValue={String(vendor?.sample ?? false)}><option value="false">No</option><option value="true">Yes</option></select></label>
          <p className="sa-card__hint">{editing ? "Diamond count: " + vendor.diamondCount : "New vendors start with a diamond count of 0."}</p>
          <div className="sa-row"><button disabled={busy} className="sa-button sa-button--primary">{editing ? "Save changes" : "Create vendor"}</button></div>
        </Form>
      </div>}
        </section>
      </div>}
      <section className="sa-card sa-diamond-inventory" aria-label="Created vendors" aria-busy={busy}>
        <div className="sa-diamond-inventory__heading">
          <div><strong>{count.toLocaleString()} available vendors</strong><span>{count === 1 ? "1 result" : `${count.toLocaleString()} results`}</span></div>
          {busy && <span className="sa-diamond-loading" role="status">Updating…</span>}
        </div>
        <div className="sa-diamond-toolbar">
          <Form method="get" className="sa-diamond-search" onSubmit={() => setFiltersOpen(false)}>{sortFields}
            <input className="sa-input" type="search" name="q" defaultValue={filters.q} key={filters.q} maxLength={120} placeholder="Search vendor name or code..." aria-label="Search vendor name or code" />
            {["category", "status", "feedType"].map((key) => <input key={key} type="hidden" name={key} value={filters[key]} />)}
            <button type="submit" className="sa-diamond-icon-button" aria-label="Search vendors"><AdminIcon name="search" size={18} /></button>
          </Form>
          <button className="sa-diamond-tool-button" type="button" aria-expanded={filtersOpen} aria-controls="vendor-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <AdminIcon name="filters" size={17} /><span>Filters{activeCount ? ` (${activeCount})` : ""}</span><AdminIcon name={filtersOpen ? "chevronUp" : "chevronDown"} size={15} />
          </button>
          <details className="sa-diamond-popover">
            <summary className="sa-diamond-tool-button"><AdminIcon name="sort" size={17} /><span>Sort</span><AdminIcon name="chevronDown" size={15} /></summary>
            <div className="sa-diamond-popover__panel">
              <Form method="get" className="sa-diamond-popover__form" key={sort + direction}>
                {Object.entries(filters).map(([key, value]) => <input type="hidden" key={key} name={key} value={value} />)}
                <label className="sa-field"><span className="sa-field__label">Sort by</span><select className="sa-select" name="sort" defaultValue={sort}>{vendorSortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="sa-field"><span className="sa-field__label">Order</span><select className="sa-select" name="direction" defaultValue={direction}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
                <button className="sa-button sa-button--primary" type="submit">Apply sort</button>
              </Form>
            </div>
          </details>
          <details className="sa-diamond-popover">
            <summary className="sa-diamond-tool-button"><AdminIcon name="columns" size={17} /><span>Columns</span><AdminIcon name="chevronDown" size={15} /></summary>
            <div className="sa-diamond-popover__panel sa-diamond-columns"><strong>Optional columns</strong>
              {vendorColumns.map(([key, label]) => <label key={key}><input type="checkbox" checked={columns[key]} onChange={(event) => setColumns((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
            </div>
          </details>
        </div>
        {filtersOpen && <div id="vendor-filters" className="sa-diamond-filter-panel">
          <button className="sa-diamond-filter-panel__close" type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><AdminIcon name="close" size={17} /></button>
          <Form method="get" className="sa-diamond-filter-form" key={JSON.stringify(filters)} onSubmit={() => setFiltersOpen(false)}>
            <input type="hidden" name="q" value={filters.q} />{sortFields}
            <label className="sa-field"><span className="sa-field__label">Vendor type</span><select className="sa-select" name="category" defaultValue={filters.category}><option value="">All vendor types</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="sa-field"><span className="sa-field__label">Status</span><select className="sa-select" name="status" defaultValue={filters.status}><option value="">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
            <label className="sa-field"><span className="sa-field__label">Feed type</span><select className="sa-select" name="feedType" defaultValue={filters.feedType}><option value="">All feed types</option>{feedTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <div className="sa-diamond-filter-form__actions"><Link className="sa-button" to={vendorPath} onClick={() => setFiltersOpen(false)}>Clear all</Link><button className="sa-button sa-button--primary" type="submit">Apply filters</button></div>
          </Form>
        </div>}
        {(filters.q || activeCount > 0) && <div className="sa-diamond-chips" aria-label="Applied vendor filters">
          {[["q", "Search"], ["category", "Vendor type"], ["status", "Status"], ["feedType", "Feed type"]].filter(([key]) => filters[key]).map(([key, label]) => <Link className="sa-diamond-chip" key={key} to={vendorUrl({ [key]: "" })}><span>{label}: {filters[key]}</span><AdminIcon name="close" size={13} /></Link>)}
          <Link className="sa-diamond-clear-link" to={vendorPath}>Clear all</Link>
        </div>}
        <div className="sa-table-wrap" style={{ marginTop: 12 }}><table className="sa-table">
          <thead><tr>{[["name", "Vendor name"], ...vendorColumns, ["actions", "Actions"]].filter(([key]) => key === "name" || key === "actions" || columns[key]).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
          <tbody>{vendors.map(v => <tr key={v.id}>
            <td>{v.name}</td>{columns.category && <td><span className="sa-vendor-category"><i className={"sa-vendor-category__dot " + (categoryClasses[v.category] ?? "")} aria-hidden="true" />{v.category}</span></td>}{columns.vendorCode && <td>{v.vendorCode ?? "—"}</td>}{columns.diamondCount && <td>{v.diamondCount.toLocaleString()}</td>}
            {columns.lastImportAt && <td>{v.lastImportAt ? new Date(v.lastImportAt).toLocaleString() : "Never"}</td>}
            {columns.nextImport && <td><NextImportCountdown lastImportAt={v.lastImportAt} /></td>}
            {columns.enabled && <td>{canManage ? <Form method="post">
              <input type="hidden" name="intent" value="status" /><input type="hidden" name="id" value={v.id} /><input type="hidden" name="enabled" value={String(!v.enabled)} />
              <button className="sa-vendor-switch" role="switch" aria-checked={v.enabled} aria-label={(v.enabled ? "Disable " : "Enable ") + v.name} title={v.enabled ? "Enabled" : "Disabled"} disabled={busy}><span aria-hidden="true" /></button>
            </Form> : <span className={"sa-status-swatch " + (v.enabled ? "is-enabled" : "is-disabled")} role="img" aria-label={v.enabled ? "Enabled" : "Disabled"} />}</td>}
            <td><div className="sa-row sa-vendor-actions"><Link className="sa-icon-button" to={"?view=" + v.id} aria-label={"View " + v.name} title="View"><AdminIcon name="view" size={17} /></Link>{canManage && <><Link className="sa-icon-button" to={"?edit=" + v.id} aria-label={"Edit " + v.name} title="Edit"><AdminIcon name="edit" size={16} /></Link><VendorImportButton vendor={v} /></>}</div></td>
          </tr>)}{!vendors.length && <tr><td colSpan={2 + vendorColumns.filter(([key]) => columns[key]).length} className="sa-table__empty">No vendors match your search and filters.</td></tr>}</tbody>
        </table></div>
        <div className="sa-row">{after && <Link to={vendorUrl()}>First page</Link>}{next && <Link to={vendorUrl({ after: next })}>Next page</Link>}</div>
      </section>
    </>
  );
}

function VendorImportButton({ vendor }) {
  const fetcher = useFetcher();
  const importing = ["PENDING", "RUNNING"].includes(vendor.importJob?.status) || fetcher.state !== "idle";
  return <fetcher.Form method="post">
    <input type="hidden" name="intent" value="import" />
    <input type="hidden" name="id" value={vendor.id} />
    <button type="submit" className="sa-icon-button" disabled={importing || !vendor.enabled} aria-label={importing ? `Importing ${vendor.name}` : `Import ${vendor.name} now`} title={importing ? "Importing" : "Import now"}>
      {importing ? <span className="sa-import-spinner" aria-hidden="true" /> : <AdminIcon name="refresh" size={17} />}
    </button>
    {(fetcher.data?.error || vendor.importJob?.status === "FAILED") && <span className="sa-field__error" role="alert">{fetcher.data?.error ?? vendor.importJob.error}</span>}
  </fetcher.Form>;
}

function NextImportCountdown({ lastImportAt }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!lastImportAt || now === null) return "—";
  const remaining = Math.max(0, new Date(lastImportAt).getTime() + 8 * 60 * 60 * 1000 - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
