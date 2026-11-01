/* eslint-disable react/prop-types */
// Responsive SVG line chart for the Performance Overview.
//
// Plots two series — Before (red) and After (green) — on a fixed 0–100 axis
// with smooth curves, circular data points and subtle translucent area fills.
// Values come straight from the report pair: a missing value is simply not
// drawn, and no point is ever interpolated from nothing.
//
// Tooltips are exposed through real, focusable <button> hit targets overlaid
// on the SVG, so pointer and keyboard users get the same date / baseline /
// current detail without fighting the SVG accessibility model.

import { useState } from "react";
import { formatReportDate, formatShortDate } from "../../lib/report/model.js";

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { top: 20, right: 26, bottom: 54, left: 46 };
const Y_TICKS = [0, 25, 50, 75, 100];
export const CHART_COLORS = { before: "#FF3B45", after: "#00B566" };

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function innerHeight() {
  return HEIGHT - PAD.top - PAD.bottom;
}

function yAt(score) {
  const clamped = Math.max(0, Math.min(100, score));
  return PAD.top + innerHeight() * (1 - clamped / 100);
}

function xAt(index, count) {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  if (count <= 1) return PAD.left + innerWidth / 2;
  return PAD.left + (innerWidth * index) / (count - 1);
}

function xAnchor(index, count) {
  if (count <= 1) return "middle";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

/** Catmull-Rom → cubic Bézier smoothing through a set of points. */
function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function seriesFor(points, key) {
  const plotted = [];
  points.forEach((point, index) => {
    const value = toNumber(point[key]);
    if (value === null) return;
    plotted.push({ index, value, x: xAt(index, points.length), y: yAt(value) });
  });
  if (plotted.length === 0) return { line: "", area: "", points: plotted };
  const baselineY = yAt(0);
  const line = smoothPath(plotted);
  const area =
    plotted.length >= 2
      ? `${line} L ${plotted[plotted.length - 1].x} ${baselineY} L ${plotted[0].x} ${baselineY} Z`
      : "";
  return { line, area, points: plotted };
}

function hitLabel(point) {
  const date = formatReportDate(point.at);
  const parts = [];
  if (point.label && point.label !== date) parts.push(point.label);
  if (date) parts.push(date);
  parts.push(`Before: ${point.before ?? "—"}`);
  parts.push(`After: ${point.after ?? "—"}`);
  return parts.join(", ");
}

export default function PerformanceChart({
  points = [],
  idPrefix = "psi-chart",
  ariaLabel = "Performance score before and after",
}) {
  const [active, setActive] = useState(null);
  const count = points.length;
  const baselineY = yAt(0);
  const series = [
    { key: "before", ...seriesFor(points, "before") },
    { key: "after", ...seriesFor(points, "after") },
  ];

  const activePoint = active != null ? points[active] : null;
  const activeX = active != null ? xAt(active, count) : null;
  let tooltipTop = PAD.top;
  if (activePoint) {
    const values = [toNumber(activePoint.before), toNumber(activePoint.after)].filter(
      (value) => value !== null,
    );
    if (values.length > 0) tooltipTop = yAt(Math.max(...values));
  }

  // With many days the axis labels would collide, so thin them out (the first
  // and last always stay). Hit targets are sized to the point spacing so they
  // never overlap each other.
  const labelStep = count > 7 ? Math.ceil(count / 6) : 1;
  const showAxisLabel = (index) =>
    index === 0 || index === count - 1 || index % labelStep === 0;
  const innerWidthRatio = (WIDTH - PAD.left - PAD.right) / WIDTH;
  const spacingPct = count > 1 ? (100 * innerWidthRatio) / (count - 1) : 100;
  const hitWidth = Math.max(1.8, Math.min(14, spacingPct * 0.9));

  return (
    <div className="psi-chart__canvas">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="psi-chart__svg"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={`${idPrefix}-before-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.before} stopOpacity="0.22" />
            <stop offset="100%" stopColor={CHART_COLORS.before} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-after-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.after} stopOpacity="0.22" />
            <stop offset="100%" stopColor={CHART_COLORS.after} stopOpacity="0" />
          </linearGradient>
        </defs>

        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yAt(tick)}
              y2={yAt(tick)}
              className="psi-chart__grid"
            />
            <text
              x={PAD.left - 10}
              y={yAt(tick)}
              className="psi-chart__tick"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick}
            </text>
          </g>
        ))}

        {activeX != null && (
          <line
            x1={activeX}
            x2={activeX}
            y1={PAD.top}
            y2={baselineY}
            className="psi-chart__guide"
          />
        )}

        {series.map((serie) => (
          <g key={serie.key}>
            {serie.area ? (
              <path d={serie.area} fill={`url(#${idPrefix}-${serie.key}-fill)`} />
            ) : null}
            {serie.line ? (
              <path
                d={serie.line}
                className="psi-chart__line"
                stroke={CHART_COLORS[serie.key]}
                fill="none"
              />
            ) : null}
            {serie.points.map((point) => (
              <circle
                key={`${serie.key}-${point.index}`}
                cx={point.x}
                cy={point.y}
                r={5}
                className="psi-chart__point"
                stroke={CHART_COLORS[serie.key]}
              />
            ))}
          </g>
        ))}

        {points.map((point, index) => {
          if (!showAxisLabel(index)) return null;
          const x = xAt(index, count);
          const dateText = point.at ? formatShortDate(point.at) : null;
          return (
            <g key={point.key ?? index}>
              {point.label ? (
                <text
                  x={x}
                  y={baselineY + 26}
                  className="psi-chart__xlabel"
                  textAnchor={xAnchor(index, count)}
                >
                  {point.label}
                </text>
              ) : null}
              {dateText ? (
                <text
                  x={x}
                  y={baselineY + (point.label ? 44 : 30)}
                  className="psi-chart__xdate"
                  textAnchor={xAnchor(index, count)}
                >
                  {dateText}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="psi-chart__hits">
        {points.map((point, index) => (
          <button
            key={point.key ?? index}
            type="button"
            className="psi-chart__hit"
            style={{
              left: `${(xAt(index, count) / WIDTH) * 100}%`,
              width: `${hitWidth}%`,
            }}
            aria-label={hitLabel(point)}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive((current) => (current === index ? null : current))}
            onFocus={() => setActive(index)}
            onBlur={() => setActive((current) => (current === index ? null : current))}
          />
        ))}
      </div>

      {activePoint ? (
        <div
          className="psi-chart__tooltip"
          role="tooltip"
          style={{
            left: `${(activeX / WIDTH) * 100}%`,
            top: `${(tooltipTop / HEIGHT) * 100}%`,
          }}
        >
          <span className="psi-chart__tooltip-date">
            {activePoint.at ? formatReportDate(activePoint.at) : activePoint.label}
          </span>
          <span className="psi-chart__tooltip-row">
            <span
              className="psi-chart__tooltip-dot"
              style={{ background: CHART_COLORS.before }}
              aria-hidden="true"
            />
            Before: {toNumber(activePoint.before) ?? "—"}
          </span>
          <span className="psi-chart__tooltip-row">
            <span
              className="psi-chart__tooltip-dot"
              style={{ background: CHART_COLORS.after }}
              aria-hidden="true"
            />
            After: {toNumber(activePoint.after) ?? "—"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
