/* eslint-disable react/prop-types -- tiny internal icon set, not a public API */

// Inline SVG icon set for the super admin panel.
//
// The panel renders outside the Shopify admin iframe, so no Polaris `s-icon`
// web component is available; a handful of hand-written SVGs keep it dependency
// free and inherit `currentColor` from the surrounding theme.

const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  shops: (
    <>
      <path d="M4 9.5h16V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z" />
      <path d="M3 9.5 4.6 4h14.8L21 9.5" />
      <path d="M9.5 21v-5.5h5V21" />
    </>
  ),
  tickets: (
    <>
      <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2.5 2.5 0 0 0 0 5v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2.5 2.5 0 0 0 0-5V6Z" />
      <path d="M12 8.5v7" strokeDasharray="2 2.4" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
      <path d="M16.5 8.6a3 3 0 1 0 0 .01" />
      <path d="M16 14.9c2.6.3 4.5 2.2 4.5 5.1" />
    </>
  ),
  logout: (
    <>
      <path d="M14 20H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8" />
      <path d="M16.5 8.5 20 12l-3.5 3.5" />
      <path d="M20 12H10" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  filters: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="1.8" fill="var(--sa-surface, #fff)" />
      <circle cx="15" cy="12" r="1.8" fill="var(--sa-surface, #fff)" />
      <circle cx="8" cy="18" r="1.8" fill="var(--sa-surface, #fff)" />
    </>
  ),
  sort: (
    <>
      <path d="M8 4v16m0 0-3-3m3 3 3-3M16 20V4m0 0-3 3m3-3 3 3" />
    </>
  ),
  columns: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M9 5v14m6-14v14" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  view: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  edit: (
    <>
      <path d="m14 5 5 5" />
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 0 0-12-4.8L5 9" />
      <path d="M4 17v-5h5" />
      <path d="M5 12a7 7 0 0 0 12 4.8L19 15" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </>
  ),
};

/**
 * @param {{name: keyof typeof PATHS, size?: number, strokeWidth?: number}} props
 */
export default function AdminIcon({ name, size = 18, strokeWidth = 1.6 }) {
  const content = PATHS[name] ?? PATHS.alert;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      {content}
    </svg>
  );
}
