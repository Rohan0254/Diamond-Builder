/* eslint-disable react/prop-types */
// Standard Lighthouse performance metrics list.
//
// Renders the five metrics (FCP, LCP, TBT, CLS, Speed Index) with a status
// dot + label showing Good / Needs improvement / Poor, computed purely from
// the metric thresholds in `model.js`. Missing values render "—" with a
// neutral dot — fabricated numbers are never displayed.

import {
  METRIC_DEFINITIONS,
  metricStatus,
  metricColor,
  METRIC_STATUS_LABELS,
  formatMetricValue,
} from "../../lib/report/model.js";

export default function MetricList({ metrics }) {
  return (
    <div className="psi-metrics">
      {METRIC_DEFINITIONS.map((def) => {
        const value = metrics?.[def.key]?.value ?? null;
        const status = metricStatus(def, value);
        const color = status ? metricColor(status) : "#dadce0";
        const statusLabel = status ? METRIC_STATUS_LABELS[status] : "Not available";
        return (
          <div className="psi-metrics__row" key={def.key}>
            <span className="psi-metrics__dot" style={{ background: color }} aria-hidden="true" />
            <span className="psi-metrics__name">
              <span className="psi-metrics__title">{def.label}</span>
              <span className="psi-metrics__short">{def.shortLabel}</span>
            </span>
            <span
              className="psi-metrics__status"
              style={{ color }}
              title={statusLabel}
            >
              {statusLabel}
            </span>
            <span className="psi-metrics__value" style={{ color }}>
              {value == null ? "—" : formatMetricValue(def, value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}