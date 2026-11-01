/* eslint-disable react/prop-types */
// Reusable circular Lighthouse-style score indicator.
//
// Renders an SVG ring whose stroke length reflects the 0–100 score, colored
// by the standard score bands (green ≥ 90, orange 50–89, red ≤ 49). A lighter
// background ring fills the remaining arc. Missing scores render a neutral
// gray ring with "—" and are never presented as a real value.

import { scoreBand } from "../../lib/report/model.js";

const SIZES = {
  sm: { px: 45, stroke: 6, fontSize: 12 },
  lg: { px: 45, stroke: 6, fontSize: 12 },
};

export default function ScoreCircle({ score, label = "Score", size = "sm" }) {
  const band = scoreBand(score);
  const { px, stroke, fontSize } = SIZES[size] ?? SIZES.sm;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const valid = typeof score === "number" && Number.isFinite(score);
  const clamped = valid ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference * (1 - clamped / 100);
  const color = band?.color ?? "#dadce0";
  const bandLabel = band ? band.label : "not available";

  return (
    <div
      className="psi-score"
      role="img"
      aria-label={`${label}: ${valid ? `${score} out of 100 (${bandLabel})` : "not available"}`}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="psi-score__svg" aria-hidden="true">
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.14}
          strokeWidth={stroke}
        />
        {valid && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${px / 2} ${px / 2})`}
          />
        )}
      </svg>
      <span className="psi-score__value" style={{ color, fontSize }}>
        {valid ? Math.round(score) : "—"}
      </span>
    </div>
  );
}