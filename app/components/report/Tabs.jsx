/* eslint-disable react/prop-types */
// Generic accessible tab strip.
//
// Implements the tabs pattern with roving tabindex and arrow-key navigation
// (Left/Right), matching how the Shopify admin renders tab selectors. Each
// parent passes a stable `idPrefix` so multiple tab strips on the same page
// never share element ids, and `options` to render any tab list (report
// versions, devices, …).
//
// `bordered` draws the hairline under the strip. When false, the parent
// supplies its own horizontal rule (used by the report section which lays two
// tab strips side by side in one row).

import { useRef } from "react";

export const DEVICE_OPTIONS = [
  { key: "desktop", label: "Desktop", icon: "desktop" },
  { key: "mobile", label: "Mobile", icon: "mobile" },
];

export default function Tabs({
  value,
  onChange,
  idPrefix = "tabs",
  options,
  label = "Selection",
  bordered = true,
}) {
  const tablistId = `${idPrefix}-tabs`;
  const tabRefs = useRef({});

  const move = (event, index) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % options.length
        : (index - 1 + options.length) % options.length;
    const key = options[next].key;
    onChange(key);
    // Move focus to the newly selected tab (roving tabindex).
    tabRefs.current[key]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      id={tablistId}
      className={`psi-tabs${bordered ? " psi-tabs--bordered" : ""}`}
    >
      {options.map((option, index) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            ref={(el) => {
              tabRefs.current[option.key] = el;
            }}
            id={`${tablistId}-${option.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`psi-tabs__tab${selected ? " psi-tabs__tab--active" : ""}`}
            onClick={() => onChange(option.key)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.icon ? <s-icon type={option.icon} size={16} aria-hidden="true" /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}