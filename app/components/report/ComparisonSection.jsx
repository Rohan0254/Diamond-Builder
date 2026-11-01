/* eslint-disable react/prop-types */
// Dedicated before-and-after comparison section.
//
// Owns an independent Mobile/Desktop tab strip and renders one row per
// compared category (performance score + the five standard metrics). All
// math lives in `compare.js` — this component only renders the rows it is
// handed, including the neutral "not available" state when a comparison
// cannot be calculated.

import { useState } from "react";
import Tabs, { DEVICE_OPTIONS } from "./Tabs.jsx";
import { compareReports, ROW_STATES } from "../../lib/report/compare.js";

function DeltaCell({ row }) {
  const active = row.state === ROW_STATES.improved || row.state === ROW_STATES.worsened;
  if (!active) {
    return <span className="psi-compare__missing">{row.changeText}</span>;
  }
  return (
    <span className="psi-compare__delta-text">
      <s-icon type={row.arrow === "up" ? "arrow-up" : "arrow-down"} aria-hidden="true" />
      {row.changeText}
    </span>
  );
}

export default function ComparisonSection({ current, baseline }) {
  const [device, setDevice] = useState("desktop");
  const rows = compareReports(current?.[device], baseline?.[device]);
  const activeTabId = `compare-tabs-${device}`;
  const panelId = "compare-panel";

  return (
    <section className="psi-compare" aria-labelledby="compare-heading">
      <div className="psi-compare__header">
        <div className="psi-compare__heading">
          <s-heading id="compare-heading">Before &amp; After Comparison</s-heading>
          <s-text color="subdued">
            How your store&apos;s key metrics changed between the baseline report and the current report.
          </s-text>
        </div>

        <Tabs
          idPrefix="compare"
          label="Device"
          options={DEVICE_OPTIONS}
          value={device}
          onChange={setDevice}
        />
      </div>

      <div className="psi-compare__body" role="tabpanel" id={panelId} aria-labelledby={activeTabId} tabIndex={0}>
        {rows.length === 0 ? (
          <div className="psi-compare__empty">
            <s-text color="subdued">
              No previous report to compare against yet. Run the PageSpeed test again later and the
              two runs will be compared here.
            </s-text>
          </div>
        ) : (
          <table className="psi-compare__table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Before</th>
              <th scope="col">Change</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`psi-compare__row${
                  row.state === ROW_STATES.improved || row.state === ROW_STATES.worsened
                    ? ` psi-compare__row--${row.state}`
                    : ""
                }`}
              >
                <td className="psi-compare__label">{row.label}</td>
                <td className="psi-compare__value">{row.beforeText}</td>
                <td className="psi-compare__delta">
                  <DeltaCell row={row} />
                </td>
                <td className="psi-compare__value psi-compare__value--after">{row.afterText}</td>
              </tr>
            ))}
          </tbody>
          </table>
        )}

        <div className="psi-compare__note">
          <s-text color="subdued">
            Comparison between two separate reports. An improved delta does not, by itself, prove
            the optimization caused it.
          </s-text>
        </div>
      </div>
    </section>
  );
}