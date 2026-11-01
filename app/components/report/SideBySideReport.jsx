/* eslint-disable react/prop-types */
// Renders Current (left) and Before (right) side-by-side. Each column has its
// own Desktop/Mobile switch, so only the selected device is shown at a time
// instead of stacking both. When no baseline has been captured the "Before"
// column shows a neutral empty state — a baseline is never fabricated.

import { useState } from "react";
import DeviceBlock from "./DeviceBlock.jsx";
import Tabs, { DEVICE_OPTIONS } from "./Tabs.jsx";

function EmptyColumn({ children }) {
  return (
    <div className="psi-col-empty">
      <s-text color="subdued">{children}</s-text>
    </div>
  );
}

export default function SideBySideReport({ idPrefix, reports, initialDevice = "desktop" }) {
  const current = reports?.current ?? {};
  const baseline = reports?.baseline ?? {};
  const hasBaseline = Boolean(baseline.mobile || baseline.desktop);

  const [currentDevice, setCurrentDevice] = useState(initialDevice);
  const [beforeDevice, setBeforeDevice] = useState(initialDevice);

  return (
    <section className="psi-side-by-side">
      <div className="psi-side-by-side__columns">
        <div className="psi-side-by-side__col psi-side-by-side__col--current">
          <div className="psi-col-header psi-col-header--device">
            <s-heading level={2}>Current</s-heading>
            <Tabs
              idPrefix={`${idPrefix}-current`}
              label="Current device"
              options={DEVICE_OPTIONS}
              value={currentDevice}
              onChange={setCurrentDevice}
              bordered={false}
            />
          </div>
          {current[currentDevice] ? (
            <DeviceBlock
              report={current[currentDevice]}
              device={currentDevice}
              idPrefix={`${idPrefix}-current-${currentDevice}`}
            />
          ) : (
            <EmptyColumn>
              No after score yet. Install the optimization script, then run the PageSpeed test
              again to compare against your before score.
            </EmptyColumn>
          )}
        </div>

        <div className="psi-side-by-side__col psi-side-by-side__col--before">
          <div className="psi-col-header psi-col-header--device">
            <s-heading level={2}>Before</s-heading>
            <Tabs
              idPrefix={`${idPrefix}-before`}
              label="Before device"
              options={DEVICE_OPTIONS}
              value={beforeDevice}
              onChange={setBeforeDevice}
              bordered={false}
            />
          </div>
          {hasBaseline && baseline[beforeDevice] ? (
            <DeviceBlock
              report={baseline[beforeDevice]}
              device={beforeDevice}
              idPrefix={`${idPrefix}-before-${beforeDevice}`}
            />
          ) : (
            <EmptyColumn>
              No previous report yet. Run the PageSpeed test again to compare against this run.
            </EmptyColumn>
          )}
        </div>
      </div>
    </section>
  );
}
