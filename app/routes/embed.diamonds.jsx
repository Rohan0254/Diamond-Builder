import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { queryDiamonds } from "../data/diamonds.js";

const SHAPES = [
  "Round", "Oval", "Emerald", "Princess", "Cushion",
  "Pear", "Radiant", "Asscher", "Marquise", "Heart",
];
const CUTS = ["Ideal", "Excellent", "Very Good", "Good"];
const COLORS = ["D", "E", "F", "G", "H", "I", "J", "K"];
const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2"];

export async function loader({ request }) {
  const params = new URL(request.url).searchParams;
  const pageType = (params.get("type") || "").trim().toLowerCase();
  const category = (params.get("category") || "Natural").trim();
  const shape = (params.get("shape") || "").trim();
  const cut = (params.get("cut") || "").trim();
  const color = (params.get("color") || "").trim();
  const clarity = (params.get("clarity") || "").trim();
  const sort = (params.get("sort") || "price_asc").trim();
  const page = Math.max(1, Number(params.get("page")) || 1);

  try {
    const data = await queryDiamonds({
      pageType,
      category,
      shape,
      cut,
      color,
      clarity,
      sort,
      page,
      pageSize: 12,
    });
    return {
      ...data,
      category,
      filters: { shape, cut, color, clarity, sort },
    };
  } catch (error) {
    console.error("[embed.diamonds] Failed to load diamonds:", error);
    return {
      diamonds: [],
      totalCount: 0,
      page: 1,
      pageSize: 12,
      category,
      filters: { shape: "", cut: "", color: "", clarity: "", sort: "price_asc" },
    };
  }
}

export default function DiamondsStandalonePreview() {
  const { diamonds, totalCount, page, pageSize, category, filters } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState("grid");

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    setSearchParams(next);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="wsc-builder-mount wsc-standalone-wrap">
      <style>{`
        .wsc-standalone-wrap { max-width: 1400px; margin: 0 auto; padding: 24px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
        .wsc-standalone-bar { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; align-items: center; justify-content: space-between; }
        .wsc-standalone-shapes { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; margin-bottom: 16px; }
        .wsc-standalone-shape { padding: 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-size: 12px; font-weight: 600; cursor: pointer; }
        .wsc-standalone-shape--active { background: #0f172a; color: #fff; border-color: #0f172a; }
        .wsc-standalone-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .wsc-standalone-select { width: 100%; height: 38px; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; }
        .wsc-standalone-tabs { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .wsc-standalone-tab { padding: 7px 14px; border: 0; background: #fff; color: #475569; font-weight: 600; cursor: pointer; }
        .wsc-standalone-tab--active { background: #0f172a; color: #fff; }
        .wsc-standalone-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
        .wsc-standalone-card { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
        .wsc-standalone-media { height: 190px; background: #f8fafc; display: flex; align-items: center; justify-content: center; padding: 12px; }
        .wsc-standalone-media img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .wsc-standalone-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
        .wsc-standalone-table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; background: #fff; font-size: 13px; }
        .wsc-standalone-table th, .wsc-standalone-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        .wsc-standalone-table th { background: #f8fafc; color: #475569; }
        @media (max-width: 1024px) { .wsc-standalone-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 600px) { .wsc-standalone-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="wsc-standalone-bar">
        <h2 style={{ margin: 0 }}>{category} Diamonds ({totalCount})</h2>
        <div className="wsc-standalone-tabs">
          <button type="button" className={`wsc-standalone-tab${viewMode === "grid" ? " wsc-standalone-tab--active" : ""}`} onClick={() => setViewMode("grid")}>Grid View</button>
          <button type="button" className={`wsc-standalone-tab${viewMode === "list" ? " wsc-standalone-tab--active" : ""}`} onClick={() => setViewMode("list")}>List View</button>
        </div>
      </div>

      <div className="wsc-standalone-shapes">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            className={`wsc-standalone-shape${filters.shape === s ? " wsc-standalone-shape--active" : ""}`}
            onClick={() => updateFilter("shape", filters.shape === s ? "" : s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="wsc-standalone-filters">
        <select className="wsc-standalone-select" aria-label="Cut" value={filters.cut} onChange={(e) => updateFilter("cut", e.target.value)}>
          <option value="">All Cuts</option>
          {CUTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="wsc-standalone-select" aria-label="Color" value={filters.color} onChange={(e) => updateFilter("color", e.target.value)}>
          <option value="">All Colors</option>
          {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="wsc-standalone-select" aria-label="Clarity" value={filters.clarity} onChange={(e) => updateFilter("clarity", e.target.value)}>
          <option value="">All Clarities</option>
          {CLARITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="wsc-standalone-select" aria-label="Sort" value={filters.sort} onChange={(e) => updateFilter("sort", e.target.value)}>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="carat_desc">Carat: High to Low</option>
        </select>
      </div>

      {diamonds.length === 0 ? (
        <div className="wsc-standalone-card" style={{ padding: "24px", textAlign: "center" }}>No diamonds found for this category.</div>
      ) : viewMode === "list" ? (
        <table className="wsc-standalone-table">
          <thead>
            <tr><th>Title</th><th>Shape</th><th>Carat</th><th>Color</th><th>Clarity</th><th>Cut</th><th>Price</th></tr>
          </thead>
          <tbody>
            {diamonds.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.title}</strong></td>
                <td>{d.shape || "—"}</td>
                <td>{d.carats != null ? `${d.carats}ct` : "—"}</td>
                <td>{d.colore || "—"}</td>
                <td>{d.clarity || "—"}</td>
                <td>{d.cut || "—"}</td>
                <td><strong>${Number(d.price || 0).toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="wsc-standalone-grid">
          {diamonds.map((d) => (
            <div key={d.id} className="wsc-standalone-card">
              <div className="wsc-standalone-media">
                {d.image ? <img src={d.image} alt={d.title} loading="lazy" /> : <span>{d.shape || "Diamond"}</span>}
              </div>
              <div className="wsc-standalone-body">
                <div style={{ fontWeight: 600 }}>{d.title}</div>
                <div style={{ fontSize: "12px", color: "#475569" }}>
                  {[d.shape, d.carats ? `${d.carats}ct` : "", d.colore, d.clarity, d.cut].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontWeight: 700 }}>${Number(d.price || 0).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button type="button" disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))}>
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => updateFilter("page", String(page + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
