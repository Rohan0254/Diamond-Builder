/* eslint-disable react/prop-types */
// Horizontal five-category score summary row for a report.
//
// The first four categories render as circular score indicators
// (Performance, Accessibility, Best Practices, SEO). Agentic Browsing is a
// distinct category that has no 0–100 score — PageSpeed returns it as a
// passed/total check ratio — so it renders as a chip instead of a score circle.

import ScoreCircle from "./ScoreCircle.jsx";

const CATEGORIES = [
  { key: "performance", label: "Performance" },
  { key: "accessibility", label: "Accessibility" },
  { key: "bestPractices", label: "Best Practices" },
  { key: "seo", label: "SEO" },
];

export default function ScoreSummary({ report }) {
  const scores = report?.scores ?? {};
  const agentic = report?.agenticBrowsing ?? { passed: 0, total: 0 };
  // Show the chip only once PageSpeed actually reported checks, so it never
  // renders a misleading "0/0 checks passed".
  const hasAgentic = Number(agentic.total) > 0;

  return (
    <div className="psi-summary">
      {CATEGORIES.map((category) => (
        <div className="psi-summary__item" key={category.key}>
          <ScoreCircle score={scores[category.key] ?? null} label={category.label} size="sm" />
          <span className="psi-summary__label">{category.label}</span>
        </div>
      ))}
      {hasAgentic && (
        <div className="psi-summary__item psi-summary__item--agentic">
          <span className="psi-agentic__chip">
            <s-icon type="bolt" aria-hidden="true" />
            <span>
              {agentic.passed ?? "—"}/{agentic.total ?? "—"} checks passed
            </span>
          </span>
          <span className="psi-summary__label">Agentic Browsing</span>
        </div>
      )}
    </div>
  );
}