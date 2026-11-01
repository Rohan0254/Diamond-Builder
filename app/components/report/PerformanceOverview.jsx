/* eslint-disable react/prop-types */
// Performance Overview — the Before vs. After dashboard hero.
//
// A single reusable comparison component. It owns its Mobile/Desktop switch
// (Mobile by default) and drives the chart, the summary panel, the SEO & Site
// Health column and the "See more details" link from the *same* selected report
// pair, so the whole block always stays consistent.
//
// The desktop layout is a balanced 50/50 split: performance (chart + summary
// metrics) on the left, the SEO & Site Health panel on the right, with a
// hairline divider between them. Below 990px the two columns stack, SEO last.
// The five Lighthouse category scores live on the detailed report
// (`/app/report`), not here.
//
// It receives the four normalized reports directly:
//   beforeMobileReport / afterMobileReport / beforeDesktopReport / afterDesktopReport
//
// All arithmetic lives in `app/lib/report/overview.js` (performance) and
// `app/lib/report/seo.js` (site health); all thresholds and formatting live in
// `app/lib/report/model.js`. This component only decides what to render, and
// shows an informative empty state — never a fake score — when a report is
// unavailable.

import { useState } from "react";
import Tabs, { DEVICE_OPTIONS } from "./Tabs.jsx";
import PerformanceChart from "./PerformanceChart.jsx";
import SeoHealthPanel from "./SeoHealthPanel.jsx";
import {
  getMetricDefinition,
  metricColor,
  metricStatus,
  scoreColor,
} from "../../lib/report/model.js";
import {
  DEFAULT_RANGE_DAYS,
  REPORT_RANGES,
  buildPerformanceSeries,
  buildPerformanceSummary,
} from "../../lib/report/overview.js";

const NEUTRAL = "#5f6368";

/** The Date range filter options — one per window in `REPORT_RANGES`. */
const RANGE_OPTIONS = REPORT_RANGES.map((days) => ({
  key: String(days),
  label: `${days} days`,
}));

/** Colored trend chip: green when better, red when worse, neutral otherwise. */
function TrendBadge({ trend, arrow, text }) {
  return (
    <span className={`psi-ov__delta psi-ov__delta--${trend}`}>
      {arrow ? <s-icon type={arrow === "up" ? "arrow-up" : "arrow-down"} aria-hidden="true" /> : null}
      <span>{text}</span>
    </span>
  );
}

/** One row of the summary panel (label + before→after + delta). */
function SummaryRow({ label, trend, arrow, deltaText, beforeText, afterText, color }) {
  return (
    <div className="psi-ov__metric">
      <div className="psi-ov__metric-head">
        <span className="psi-ov__metric-label">{label}</span>
        <TrendBadge trend={trend} arrow={arrow} text={deltaText} />
      </div>
      <div className="psi-ov__metric-values">
        <span className="psi-ov__metric-before">{beforeText}</span>
        <span className="psi-ov__metric-sep" aria-hidden="true">
          →
        </span>
        <span className="psi-ov__metric-after" style={{ color }}>
          {afterText}
        </span>
      </div>
    </div>
  );
}

function SummaryPanel({ summary }) {
  const performance = summary.performance;
  return (
    <div className="psi-ov__summary-inner">
      <SummaryRow
        label="Performance Score"
        trend={performance.trend}
        arrow={performance.arrow}
        deltaText={performance.delta === null ? "Not available" : `${performance.deltaText} pts`}
        beforeText={performance.beforeText}
        afterText={performance.afterText}
        color={scoreColor(performance.after) ?? NEUTRAL}
      />
      {summary.metrics.map((metric) => {
        const color = metricColor(metricStatus(getMetricDefinition(metric.key), metric.after)) ?? NEUTRAL;
        return (
          <SummaryRow
            key={metric.key}
            label={metric.label}
            trend={metric.trend}
            arrow={metric.arrow}
            deltaText={metric.deltaText}
            beforeText={metric.beforeText}
            afterText={metric.afterText}
            color={color}
          />
        );
      })}
    </div>
  );
}

export default function PerformanceOverview({
  beforeMobileReport = null,
  afterMobileReport = null,
  beforeDesktopReport = null,
  afterDesktopReport = null,
  mobileHistory = [],
  desktopHistory = [],
  isSample = false,
}) {
  const [device, setDevice] = useState("mobile");
  const [rangeDays, setRangeDays] = useState(DEFAULT_RANGE_DAYS);

  const pairs = {
    mobile: { before: beforeMobileReport, after: afterMobileReport },
    desktop: { before: beforeDesktopReport, after: afterDesktopReport },
  };
  const { before, after } = pairs[device] ?? { before: null, after: null };
  const history = device === "mobile" ? mobileHistory : desktopHistory;

  const hasBaseline = Boolean(before);
  const hasCurrent = Boolean(after);
  const ready = hasBaseline && hasCurrent;

  const series = ready
    ? buildPerformanceSeries({ before, after, history, days: rangeDays })
    : [];
  const summary = ready ? buildPerformanceSummary(before, after) : null;

  return (
    <section
      className="psi-ov"
      id="performance-overview"
      aria-labelledby="performance-overview-heading"
    >

      {!ready ? (
        <div className="psi-ov__empty">
          <s-text color="subdued">
            {!hasBaseline
              ? "We're still capturing your store's baseline performance. This overview appears as soon as the first PageSpeed test finishes."
              : "Your baseline is captured. Install Speed Scratcher, then run the PageSpeed test again to see the before-and-after comparison here."}
          </s-text>
        </div>
      ) : (
        <>
          <div className="psi-ov__dashboard">
            <div className="psi-ov__pane psi-ov__pane--perf">
              <div className="psi-ov__chart-head">
                <s-heading level={2}>Performance Score</s-heading>
                <div className="psi-ov__chart-controls">
                  <Tabs
                    idPrefix="overview-range"
                    label="Date range"
                    options={RANGE_OPTIONS}
                    value={String(rangeDays)}
                    onChange={(key) => setRangeDays(Number(key))}
                  />
                  <Tabs
                    idPrefix="overview"
                    label="Device"
                    options={DEVICE_OPTIONS}
                    value={device}
                    onChange={setDevice}
                  />
                </div>
              </div>
              <div className="psi-ov__chart-card" key={device}>
                <ul className="psi-ov__legend">
                  <li>
                    <span
                      className="psi-ov__legend-dot"
                      style={{ background: "#FF3B45" }}
                      aria-hidden="true"
                    />
                    Before
                  </li>
                  <li>
                    <span
                      className="psi-ov__legend-dot"
                      style={{ background: "#00B566" }}
                      aria-hidden="true"
                    />
                    After
                  </li>
                </ul>
                <PerformanceChart points={series} idPrefix={`overview-${device}`} />
              </div>

              <aside className="psi-ov__summary" aria-label="Performance summary">
                <SummaryPanel summary={summary} />
              </aside>
            </div>

            <div className="psi-ov__pane psi-ov__pane--seo">
              <SeoHealthPanel
                report={after ?? before}
                device={device}
                seoHref="/app/seo"
              />
            </div>
          </div>

          {/* The "See more details" call to action was removed from the
              dashboard; the full report now opens from the SEO panel. Restore
              it here with a navigate() handler to "/app/report?device=..." if
              it is wanted back. */}
        </>
      )}

      {isSample && ready ? (
        <div className="psi-ov__note">
          <s-text color="subdued">
            Preview uses sample data — run a PageSpeed test for your store&apos;s real numbers.
          </s-text>
        </div>
      ) : null}
    </section>
  );
}
