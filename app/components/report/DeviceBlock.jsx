/* eslint-disable react/prop-types */
// Renders a single device's report block (score summary, large performance
// score + legend, preview, and an accordion with metrics + audits). The active
// device is chosen by the parent's Desktop/Mobile switch, so the block itself
// has no device heading.

import { useState } from "react";
import ScoreSummary from "./ScoreSummary.jsx";
import ScoreCircle from "./ScoreCircle.jsx";
import MetricList from "./MetricList.jsx";
import AuditGroups from "./AuditGroups.jsx";
import StorePreview from "./StorePreview.jsx";
import { formatReportDate } from "../../lib/report/model.js";

const LEGEND = [
  { color: "#0b8043", range: "90–100", label: "Good" },
  { color: "#e37400", range: "50–89", label: "Needs improvement" },
  { color: "#d93025", range: "0–49", label: "Poor" },
];

export default function DeviceBlock({ report, device, idPrefix }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `${idPrefix}-details`;

  if (!report) return null;

  return (
    <div className="psi-device-block">
      <ScoreSummary report={report} />

      <div className="psi-report__main psi-report__main--hidden">
        <div className="psi-report__left">
          <div className="psi-score-panel">
            <ScoreCircle score={report.scores?.performance ?? null} label="Performance" size="lg" />
            <s-heading>Performance</s-heading>
            <s-text color="subdued">
              These scores estimate how well your storefront performs for this device.
            </s-text>
          </div>

          <div className="psi-legend">
            {LEGEND.map((item) => (
              <div className="psi-legend__row" key={item.range}>
                <span className="psi-legend__dot" style={{ background: item.color }} aria-hidden="true" />
                <span>{item.label}</span>
                <span className="psi-legend__range">{item.range}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="psi-report__right">
          <StorePreview device={device} screenshot={report.screenshot ?? null} />
          <div className="psi-report__meta">
            <s-text color="subdued">
              {report.capturedAt ? `Reported: ${formatReportDate(report.capturedAt)}` : "No capture timestamp yet"}
            </s-text>
          </div>
        </aside>
      </div>

      <button
        type="button"
        className="psi-seemore"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{expanded ? "See less" : "See more"}</span>
        <s-icon type={expanded ? "chevron-up" : "chevron-down"} size={16} aria-hidden="true" />
      </button>

      <div id={detailsId} className={`psi-seemore-wrap${expanded ? " psi-seemore-wrap--open" : ""}`}>
        <div className="psi-seemore-inner">
          <div className="psi-seemore-content">
            <MetricList metrics={report.metrics} />
            <AuditGroups report={report} idPrefix={`${idPrefix}-audits`} />
          </div>
        </div>
      </div>
    </div>
  );
}