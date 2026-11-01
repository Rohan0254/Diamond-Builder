/* eslint-disable react/prop-types */
// Expandable audit groups (Opportunities / Diagnostics / Passed Audits).
//
// Each group header toggles the whole group; each individual audit row toggles
// its own description. Interactions are plain `<button>`s with `aria-expanded`
// / `aria-controls` so the lists stay keyboard and screen-reader friendly.

import { useState } from "react";
import { scoreColor } from "../../lib/report/model.js";

/** One expandable audit row. */
function AuditRow({ item, itemId }) {
  const [open, setOpen] = useState(false);
  const detailId = `${itemId}-detail`;
  return (
    <div className="psi-audit">
      <button
        type="button"
        className="psi-audit__trigger"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="psi-audit__dot"
          style={{ background: item.score != null ? scoreColor(item.score * 100) : "#dadce0" }}
          aria-hidden="true"
        />
        <span className="psi-audit__title">{item.title}</span>
        {item.savings && <span className="psi-audit__savings">Savings: {item.savings}</span>}
        <s-icon
          type={open ? "chevron-up" : "chevron-down"}
          size={16}
          className="psi-audit__caret"
          aria-hidden="true"
        />
      </button>
      <div id={detailId} className={`psi-audit__detail${open ? " psi-audit__detail--open" : ""}`}>
        <div className="psi-audit__detail-inner">
          <div className="psi-audit__detail-content">
            <s-text color="subdued">{item.description || "No additional details."}</s-text>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One collapsible group: Opportunities / Diagnostics / Passed Audits. */
function AuditGroup({ title, items, groupId }) {
  const [open, setOpen] = useState(true);
  const bodyId = `${groupId}-body`;
  if (!items || items.length === 0) return null;
  return (
    <div className="psi-audit-group">
      <button
        type="button"
        className="psi-audit-group__header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="psi-audit-group__count">{items.length}</span>
        <s-icon
          type={open ? "chevron-up" : "chevron-down"}
          size={16}
          className="psi-audit__caret"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={bodyId} className="psi-audit-group__body">
          {items.map((item, index) => (
            <AuditRow key={item.id ?? index} item={item} itemId={`${groupId}-${index}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders all three audit groups for a report. */
export default function AuditGroups({ report, idPrefix }) {
  const groups = [
    { title: "Opportunities", items: report?.opportunities },
    { title: "Diagnostics", items: report?.diagnostics },
    { title: "Passed Audits", items: report?.passedAudits },
  ];
  return (
    <div className="psi-audits">
      {groups.map((group, index) => (
        <AuditGroup
          key={group.title}
          title={group.title}
          items={group.items}
          groupId={`${idPrefix}-group-${index}`}
        />
      ))}
    </div>
  );
}