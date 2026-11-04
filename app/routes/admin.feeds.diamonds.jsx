import { diamondTitle } from "../features/diamonds/diamond-title";
import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { requireStaff } from "../admin-auth.server";
import prisma from "../db.server";
import { PERMISSIONS } from "../lib/admin/roles";
import AdminIcon from "../components/admin/AdminIcon.jsx";

const PAGE_SIZES = [25, 50, 100];
const OBJECT_ID = /^[a-f\d]{24}$/i;
const SORT_FIELDS = { updatedAt: "updatedAt", price: "price", carats: "carats", vendor: "vendorId", shape: "shape", color: "colore", cut: "cut", certificate: "certificate" };
const SORT_OPTIONS = [
  ["updatedAt", "Updated date"], ["price", "Price"], ["carats", "Carats"], ["vendor", "Vendor"],
  ["shape", "Shape"], ["color", "Color"], ["cut", "Cut"], ["certificate", "Certificate"],
];
const CATEGORY_CLASSES = {
  Natural: "is-natural",
  Gemstones: "is-gemstones",
  "Colored Diamonds": "is-colored-diamonds",
  "Lab Grown Colored": "is-lab-grown-colored",
  "Lab Grown Natural": "is-lab-grown-natural",
};
const VENDOR_CATEGORIES = ["Natural", "Lab Grown Natural", "Lab Grown Colored", "Gemstones", "Colored Diamonds"];

function pageUrl(filters, { cursors = [], page = 1, pageSize = 25, sort = "updatedAt", direction = "desc" } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.stockId) params.set("stockId", filters.stockId);
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.vendorType) params.set("vendorType", filters.vendorType);
  if (filters.reportNo) params.set("reportNo", filters.reportNo);
  if (sort !== "updatedAt") params.set("sort", sort);
  if (direction) params.set("direction", direction);
  if (pageSize !== 25) params.set("size", String(pageSize));
  if (page > 1) params.set("page", String(page));
  for (const cursor of cursors) params.append("cursor", cursor);
  const query = params.toString();
  return query ? `/admin/feeds/diamonds?${query}` : "/admin/feeds/diamonds";
}

export async function loader({ request }) {
  await requireStaff(request, PERMISSIONS.DASHBOARD_VIEW);
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 120);
  const stockId = (params.get("stockId") ?? "").trim().slice(0, 120);
  const vendor = (params.get("vendor") ?? "").trim().slice(0, 120);
  const vendorType = VENDOR_CATEGORIES.includes(params.get("vendorType")) ? params.get("vendorType") : "";
  const reportNo = (params.get("reportNo") ?? "").trim().slice(0, 120);
  const sort = Object.hasOwn(SORT_FIELDS, params.get("sort")) ? params.get("sort") : "updatedAt";
  const direction = params.has("direction") ? (params.get("direction") === "asc" ? "asc" : "desc") : "desc";
  const pageSize = PAGE_SIZES.includes(Number(params.get("size"))) ? Number(params.get("size")) : 25;
  let page = Math.max(1, Number(params.get("page")) || 1);
  let cursors = params.getAll("cursor");
  if (cursors.length > 100 || cursors.some((cursor) => !OBJECT_ID.test(cursor))) throw new Response("Invalid page", { status: 400 });
  if (cursors.length !== page - 1) {
    page = 1;
    cursors = [];
  }
  const after = cursors.at(-1);

  const vendorRows = await prisma.vendor.findMany({ orderBy: { name: "asc" }, take: 250, select: { id: true, name: true, category: true } });
  const vendorOptions = [...new Set(vendorRows.map((row) => row.name).filter(Boolean))];
  const vendorTypeOptions = [...new Set(vendorRows.map((row) => row.category).filter((category) => VENDOR_CATEGORIES.includes(category)))];
  let filteredVendorIds = [];
  if (vendorType) {
    const matchingVendors = await prisma.vendor.findMany({
      where: { category: vendorType, ...(vendor ? { name: vendor } : {}) },
      take: 500,
      select: { id: true },
    });
    filteredVendorIds = matchingVendors.map((row) => row.id);
  } else if (vendor) {
    filteredVendorIds = vendorRows.filter((row) => row.name === vendor).map((row) => row.id);
  }
  const filters = { q, stockId, vendor, vendorType, reportNo };
  if ((vendor || vendorType) && !filteredVendorIds.length) return { diamonds: [], count: 0, next: null, filters, cursors, page, pageSize, sort, direction, vendorOptions, vendorTypeOptions };

  const searchConditions = q ? [
    { stockId: { startsWith: q.toUpperCase() } },
    { ReportNo: { startsWith: q } },
    { ReportNo: { startsWith: q.toUpperCase() } },
    { shape: { startsWith: q } },
    { shape: { startsWith: q.toUpperCase() } },
    { colore: { startsWith: q } },
    { colore: { startsWith: q.toUpperCase() } },
  ] : [];
  if (q) {
    const normalizedQuery = q.toLowerCase();
    const caratMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*ct\b/);
    const shapeValues = ["round", "pear", "emerald", "baguette", "marquise", "oval", "radiant", "princess", "heart", "trilliant", "triangular", "cushion", "asscher", "european", "other", "square"];
    const titleShape = shapeValues.find((shape) => normalizedQuery.includes(shape));
    const titleCategories = normalizedQuery.includes("lab grown")
      ? ["Lab Grown Natural", "Lab Grown Colored"]
      : normalizedQuery.includes("natural") ? ["Natural"]
        : normalizedQuery.includes("fancy") || normalizedQuery.includes("colored") ? ["Colored Diamonds"]
          : normalizedQuery.includes("gemstone") ? ["Gemstones"] : [];
    let titleColor = normalizedQuery
      .replace(/\d+(?:\.\d+)?\s*ct\b/g, " ")
      .replace(/\b(lab grown|natural|fancy|colored|gemstone|diamond)\b/g, " ");
    if (titleShape) titleColor = titleColor.replace(titleShape, " ");
    titleColor = titleColor.replace(/\s+/g, " ").trim();
    if (!titleCategories.length && titleColor && (caratMatch || titleShape) && normalizedQuery.includes("diamond")) titleCategories.push("Gemstones");
    const titleConditions = [];
    if (caratMatch) titleConditions.push({ carats: Number(caratMatch[1]) });
    if (titleShape) {
      const shape = titleShape.replace(/\b\w/g, (letter) => letter.toUpperCase());
      titleConditions.push({ shape: { in: [shape, shape.toUpperCase()] } });
    }
    if (titleColor) titleConditions.push({ colore: { startsWith: titleColor.replace(/\b\w/g, (letter) => letter.toUpperCase()) } });
    if (titleCategories.length) {
      const titleVendors = await prisma.vendor.findMany({ where: { category: { in: titleCategories } }, take: 500, select: { id: true } });
      titleConditions.push({ vendorId: { in: titleVendors.map((row) => row.id) } });
    }
    if (titleConditions.length) searchConditions.push({ AND: titleConditions });
  }

  const where = {
    status: 1,
    ...(q ? { OR: searchConditions } : {}),
    ...(stockId ? { stockId } : {}),
    ...(vendor || vendorType ? { vendorId: { in: filteredVendorIds } } : {}),
    ...(reportNo ? { ReportNo: reportNo } : {}),
  };
  const [rows, count] = await Promise.all([prisma.diamond.findMany({
    where,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    orderBy: [{ [SORT_FIELDS[sort]]: direction }, { id: direction }],
    take: pageSize + 1,
    select: {
      id: true, vendorId: true, stockId: true, ReportNo: true, shape: true, carats: true,
      colore: true, clarity: true, cut: true, price: true, certificate: true, image: true, pdf: true, updatedAt: true,
    },
  }), prisma.diamond.count({ where })]);

  const pageRows = rows.slice(0, pageSize);
  const pageVendorIds = [...new Set(pageRows.map((diamond) => diamond.vendorId))];
  const vendorById = new Map(vendorRows.map((row) => [row.id, row]));
  const missingVendorIds = pageVendorIds.filter((id) => !vendorById.has(id));
  if (missingVendorIds.length) {
    const missingVendors = await prisma.vendor.findMany({ where: { id: { in: missingVendorIds } }, select: { id: true, name: true, category: true } });
    for (const row of missingVendors) vendorById.set(row.id, row);
  }
  return {
    diamonds: pageRows.map((diamond) => ({ ...diamond, vendor: vendorById.get(diamond.vendorId) ?? null })),
    count,
    next: rows.length > pageSize ? pageRows[pageSize - 1].id : null,
    filters,
    cursors,
    page,
    pageSize,
    sort,
    direction,
    vendorOptions,
    vendorTypeOptions,
  };
}

function display(value) {
  return value == null || value === "" ? "—" : value;
}


const OPTIONAL_COLUMNS = [
  ["reportNo", "Report No."], ["shape", "Shape"], ["carats", "Carats"], ["color", "Color"],
  ["clarity", "Clarity"], ["cut", "Cut"], ["certificate", "Certificate"], ["updatedAt", "Updated"],
];

export default function DiamondsFeeds() {
  const { diamonds, count, next, filters, cursors, page, pageSize, sort, direction, vendorOptions, vendorTypeOptions } = useLoaderData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [columns, setColumns] = useState(() => Object.fromEntries(OPTIONAL_COLUMNS.map(([key]) => [key, true])));
  const activeFilters = [
    ["stockId", "Stock ID", filters.stockId], ["vendor", "Vendor", filters.vendor],
    ["vendorType", "Vendor type", filters.vendorType], ["reportNo", "Lab report", filters.reportNo],
  ].filter(([, , value]) => value);
  const activeCount = activeFilters.length;
  const filteredChip = (key, label, value) => (
    <Link className="sa-diamond-chip" key={key} to={pageUrl({ ...filters, [key]: "" }, { pageSize, sort, direction })}>
      <span>{label}: {value}</span><AdminIcon name="close" size={13} />
    </Link>
  );
  const hasActiveFilters = activeCount > 0 || Boolean(filters.q);
  const queryHiddenFields = (omit = "") => [
    ["stockId", filters.stockId], ["vendor", filters.vendor], ["vendorType", filters.vendorType], ["reportNo", filters.reportNo],
    ["sort", sort], ["direction", direction], ["size", pageSize],
  ].filter(([name]) => name !== omit);
  const currentPageCursors = cursors ?? [];
  const clearAllUrl = pageUrl({ q: "", stockId: "", vendor: "", vendorType: "", reportNo: "" }, { pageSize, sort, direction });
  const rangeStart = count ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, count);
  const previousUrl = page > 1
    ? pageUrl(filters, { cursors: currentPageCursors.slice(0, -1), page: page - 1, pageSize, sort, direction })
    : null;
  const nextUrl = next
    ? pageUrl(filters, { cursors: [...currentPageCursors, next], page: page + 1, pageSize, sort, direction })
    : null;

  useEffect(() => {
    setDraft(filters);
  }, [filters, page, pageSize]);

  function diamondCell(diamond, key) {
    switch (key) {
      case "reportNo": return diamond.pdf && diamond.ReportNo
        ? <a href={diamond.pdf} target="_blank" rel="noreferrer">{diamond.ReportNo}</a>
        : display(diamond.ReportNo);
      case "shape": return display(diamond.shape);
      case "carats": return display(diamond.carats);
      case "color": return display(diamond.colore);
      case "clarity": return display(diamond.clarity);
      case "cut": return display(diamond.cut);
      case "certificate": return display(diamond.certificate);
      case "updatedAt": return <time dateTime={diamond.updatedAt} title={new Date(diamond.updatedAt).toLocaleString()}>{new Date(diamond.updatedAt).toLocaleDateString()}</time>;
      default: return "—";
    }
  }

  return (
    <>
      <header className="sa-topbar sa-diamond-page-header">
        <div><p className="sa-subtitle">Feeds / Diamonds</p><h1 className="sa-title">Diamonds</h1></div>
      </header>
      <section className="sa-card sa-diamond-inventory" aria-label="Diamond inventory" aria-busy={busy}>
        <div className="sa-diamond-inventory__heading">
          <div><strong>{count.toLocaleString()} available diamonds</strong><span>{count === 1 ? "1 result" : `${count.toLocaleString()} results`}</span></div>
          {busy && <span className="sa-diamond-loading" role="status">Updating…</span>}
        </div>

        <div className="sa-diamond-toolbar">
          <Form method="get" className="sa-diamond-search" onSubmit={() => setFiltersOpen(false)}>
            <input className="sa-input" type="search" name="q" placeholder="Search diamonds..." aria-label="Search diamonds by stock ID, report number, shape, or color" defaultValue={filters.q} maxLength={120} />
            {queryHiddenFields().map(([name, value]) => <input key={name} type="hidden" name={name} value={value ?? ""} />)}
            <button type="submit" className="sa-diamond-icon-button" aria-label="Search"><AdminIcon name="search" size={18} /></button>
          </Form>

          <button className="sa-diamond-tool-button" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <AdminIcon name="filters" size={17} /><span>Filters{activeCount ? ` (${activeCount})` : ""}</span><AdminIcon name={filtersOpen ? "chevronUp" : "chevronDown"} size={15} />
          </button>

          <details className="sa-diamond-popover">
            <summary className="sa-diamond-tool-button"><AdminIcon name="sort" size={17} /><span>Sort</span><AdminIcon name="chevronDown" size={15} /></summary>
            <div className="sa-diamond-popover__panel">
              <Form method="get" className="sa-diamond-popover__form">
                <input type="hidden" name="q" value={filters.q} />
                {queryHiddenFields("sort").filter(([name]) => name !== "direction").map(([name, value]) => <input key={name} type="hidden" name={name} value={value ?? ""} />)}
                <label className="sa-field"><span className="sa-field__label">Sort by</span><select className="sa-select" name="sort" defaultValue={sort}>{SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="sa-field"><span className="sa-field__label">Order</span><select className="sa-select" name="direction" defaultValue={direction}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
                <button className="sa-button sa-button--primary" type="submit">Apply sort</button>
              </Form>
            </div>
          </details>

          <details className="sa-diamond-popover">
            <summary className="sa-diamond-tool-button"><AdminIcon name="columns" size={17} /><span>Columns</span><AdminIcon name="chevronDown" size={15} /></summary>
            <div className="sa-diamond-popover__panel sa-diamond-columns">
              <strong>Optional columns</strong>
              {OPTIONAL_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={columns[key]} onChange={(event) => setColumns((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
            </div>
          </details>
        </div>

        {filtersOpen && <div className="sa-diamond-filter-panel">
          <button className="sa-diamond-filter-panel__close" type="button" aria-label="Close filters" onClick={() => { setDraft(filters); setFiltersOpen(false); }}><AdminIcon name="close" size={17} /></button>
          <Form method="get" className="sa-diamond-filter-form" onSubmit={() => setFiltersOpen(false)}>
            <input type="hidden" name="q" value={filters.q} />
            {queryHiddenFields().filter(([name]) => !["stockId", "vendor", "vendorType", "reportNo"].includes(name)).map(([name, value]) => <input key={name} type="hidden" name={name} value={value ?? ""} />)}
            <label className="sa-field"><span className="sa-field__label">Stock ID</span><input className="sa-input" name="stockId" maxLength={120} placeholder="Exact stock ID" value={draft.stockId} onChange={(event) => setDraft((current) => ({ ...current, stockId: event.target.value }))} /></label>
            <label className="sa-field"><span className="sa-field__label">Vendor</span><select className="sa-select" name="vendor" value={draft.vendor} onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))}><option value="">All vendors</option>{vendorOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label className="sa-field"><span className="sa-field__label">Vendor type</span><select className="sa-select" name="vendorType" value={draft.vendorType} onChange={(event) => setDraft((current) => ({ ...current, vendorType: event.target.value }))}><option value="">All vendor types</option>{vendorTypeOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label className="sa-field"><span className="sa-field__label">Lab report no.</span><input className="sa-input" name="reportNo" maxLength={120} placeholder="Exact report number" value={draft.reportNo} onChange={(event) => setDraft((current) => ({ ...current, reportNo: event.target.value }))} /></label>
            <div className="sa-diamond-filter-form__actions">
              <Link className="sa-button" to={clearAllUrl} onClick={() => setFiltersOpen(false)}>Clear all</Link>
              <button className="sa-button sa-button--primary" type="submit">Apply filters</button>
            </div>
          </Form>
        </div>}

        {hasActiveFilters && <div className="sa-diamond-chips" aria-label="Applied filters">
          {filters.q && filteredChip("q", "Search", filters.q)}
          {activeFilters.map(([key, label, value]) => filteredChip(key, label, value))}
          <Link className="sa-diamond-clear-link" to={clearAllUrl}>Clear all</Link>
        </div>}

        <div className="sa-table-wrap sa-diamond-table-wrap"><table className="sa-table sa-diamond-table">
          <thead><tr>
            <th>Diamond</th><th>Vendor</th>
            {OPTIONAL_COLUMNS.filter(([key]) => columns[key] && key !== "updatedAt").map(([key, label]) => <th className={key === "carats" ? "is-numeric" : ""} key={key}>{label}</th>)}
            <th className="is-numeric">Price</th>
            {columns.updatedAt && <th>Updated</th>}
          </tr></thead>
          <tbody>{diamonds.map((diamond) => <tr key={diamond.id}>
            <td><div className="sa-diamond-product">
              {diamond.image ? <img src={diamond.image} alt="" width="44" height="44" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <span className="sa-diamond-product__placeholder" aria-hidden="true" />}
              <span><strong>{diamondTitle(diamond)}</strong><small>{diamond.stockId}</small></span>
            </div></td>
            <td><span className="sa-vendor-category"><i className={"sa-vendor-category__dot " + (CATEGORY_CLASSES[diamond.vendor?.category] ?? "")} aria-hidden="true" />{display(diamond.vendor?.name)}</span></td>
            {OPTIONAL_COLUMNS.filter(([key]) => columns[key] && key !== "updatedAt").map(([key]) => <td className={key === "carats" ? "is-numeric" : ""} key={key}>{diamondCell(diamond, key)}</td>)}
            <td className="is-numeric sa-diamond-price">{diamond.price == null ? "—" : diamond.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            {columns.updatedAt && <td>{diamondCell(diamond, "updatedAt")}</td>}
          </tr>)}{!diamonds.length && <tr><td colSpan={3 + OPTIONAL_COLUMNS.filter(([key]) => columns[key]).length} className="sa-table__empty">No diamonds match your search and filters. {hasActiveFilters && <Link to={clearAllUrl}>Clear filters</Link>}</td></tr>}</tbody>
        </table></div>

        <footer className="sa-diamond-pagination">
          <span className="sa-diamond-range">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {count.toLocaleString()}</span>
          <Form method="get" className="sa-diamond-page-size">
            <input type="hidden" name="q" value={filters.q} />
            {["stockId", "vendor", "vendorType", "reportNo"].map((key) => <input key={key} type="hidden" name={key} value={filters[key]} />)}
            <input type="hidden" name="sort" value={sort} /><input type="hidden" name="direction" value={direction} />
            <label>Rows per page<select className="sa-select" name="size" value={pageSize} onChange={(event) => event.currentTarget.form.requestSubmit()}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          </Form>
          <div className="sa-diamond-page-controls">
            {previousUrl ? <Link className="sa-button" to={previousUrl} aria-label="Previous page">Previous</Link> : <button className="sa-button" disabled>Previous</button>}
            {nextUrl ? <Link className="sa-button" to={nextUrl} aria-label="Next page">Next</Link> : <button className="sa-button" disabled>Next</button>}
          </div>
        </footer>
      </section>
    </>
  );
}

export function ErrorBoundary() {
  return (
    <section className="sa-card" role="alert">
      <h2 className="sa-title">Diamonds couldn’t load</h2>
      <p className="sa-card__hint">Something went wrong while loading the diamond inventory. Please try again.</p>
      <Link className="sa-button" to="/admin/feeds/diamonds">Retry</Link>
    </section>
  );
}
