// Super admin panel styles (`/admin`).
//
// A single exported string, injected with <style>{ADMIN_CSS}</style> by the admin
// layout and the sign-in page.
//
// The palette is the app's: Shopify green (#008060) as the accent, white cards on
// the #f6f6f7 app background, #202223 text and #dadce0 hairlines, 12-16px radii.
// The panel is plain HTML/CSS on purpose: it renders outside the Shopify admin
// iframe, where the `s-*` Polaris web components are not available.

export const ADMIN_CSS = `
  :root {
    --sa-green: #008060;
    --sa-green-dark: #006e52;
    --sa-green-soft: rgba(0, 128, 96, 0.09);
    --sa-bg: #f6f6f7;
    --sa-surface: #ffffff;
    --sa-text: #202223;
    --sa-subdued: #5f6368;
    --sa-border: #dadce0;
    --sa-border-soft: #eceef0;
    --sa-critical: #b42318;
    --sa-critical-soft: #fdeceb;
    --sa-warning: #8a6116;
    --sa-warning-soft: #fff4e5;
    --sa-info: #1a4fd6;
    --sa-info-soft: #e8f0fe;
    --sa-neutral: #5c5f62;
    --sa-neutral-soft: #f1f2f3;
    --sa-radius: 12px;
    --sa-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06);
    --sa-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.08);
  }

  /* The panel is a standalone document (root.jsx renders <body>), so it owns the
     page background and the default margin instead of relying on Polaris. */
  html, body { margin: 0; padding: 0; background: var(--sa-bg); }

  .sa-shell *,
  .sa-login * { box-sizing: border-box; }

  .sa-shell {
    display: flex;
    min-height: 100vh;
    background: var(--sa-bg);
    color: var(--sa-text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
  }

  /* ---------------------------------------------------------------- sidebar */
  .sa-sidebar {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 248px;
    flex: 0 0 248px;
    padding: 22px 16px;
    background: var(--sa-surface);
    border-right: 1px solid var(--sa-border);
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .sa-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px;
    text-decoration: none;
    color: inherit;
  }
  .sa-brand__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--sa-green);
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.02em;
  }
  .sa-brand__text { display: flex; flex-direction: column; line-height: 1.2; }
  .sa-brand__title { font-weight: 650; font-size: 15px; }
  .sa-brand__subtitle { color: var(--sa-subdued); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; }

  .sa-nav { display: flex; flex-direction: column; gap: 2px; }
  .sa-nav__heading {
    margin: 6px 6px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--sa-subdued);
  }
  .sa-nav__link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 9px;
    color: #414144;
    text-decoration: none;
    font-weight: 550;
  }
  .sa-nav__link:hover { background: var(--sa-green-soft); color: var(--sa-green-dark); }
  .sa-nav__link:focus-visible { outline: 2px solid var(--sa-green); outline-offset: -2px; }
  .sa-nav__link.is-active { background: var(--sa-green-soft); color: #04604a; font-weight: 650; }
  .sa-nav__icon { width: 18px; text-align: center; font-size: 15px; }

  .sa-sidebar__footer { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .sa-user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--sa-border);
    border-radius: var(--sa-radius);
    background: #fbfbfc;
  }
  .sa-user__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px; height: 32px;
    flex: 0 0 32px;
    border-radius: 50%;
    background: var(--sa-green-soft);
    color: var(--sa-green-dark);
    font-weight: 650;
    font-size: 12px;
  }
  .sa-user__meta { min-width: 0; }
  .sa-user__name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sa-user__role { color: var(--sa-subdued); font-size: 12px; }

  /* ------------------------------------------------------------------- main */
  .sa-main { flex: 1 1 auto; min-width: 0; padding: 26px 30px 56px; }
  .sa-topbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 22px;
  }
  .sa-title { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
  .sa-subtitle { margin: 4px 0 0; color: var(--sa-subdued); }

  /* --------------------------------------------------------------- sections */
  .sa-card {
    background: var(--sa-surface);
    border: 1px solid var(--sa-border);
    border-radius: 16px;
    box-shadow: var(--sa-shadow);
    padding: 18px;
  }
  .sa-card + .sa-card, .sa-section + .sa-section { margin-top: 20px; }
  .sa-metrics + .sa-card, .sa-metrics + .sa-section { margin-top: 20px; }
  .sa-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .sa-card__title { margin: 0; font-size: 15px; font-weight: 650; }
  .sa-card__hint { margin: 0; color: var(--sa-subdued); font-size: 13px; }

  /* Metrics: every tile is exactly 200 x 150 px, per the panel spec. */
  .sa-metrics { display: flex; flex-wrap: wrap; gap: 18px; }
  .sa-metric {
    width: 200px;
    height: 150px;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 16px;
    background: var(--sa-surface);
    border: 1px solid var(--sa-border);
    border-radius: 16px;
    box-shadow: var(--sa-shadow);
    text-decoration: none;
    color: inherit;
  }
  a.sa-metric { transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease; }
  a.sa-metric:hover { border-color: rgba(0, 128, 96, 0.5); box-shadow: var(--sa-shadow-lg); transform: translateY(-1px); }
  a.sa-metric:focus-visible { outline: 2px solid var(--sa-green); outline-offset: 2px; }
  .sa-metric__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .sa-metric__label { color: var(--sa-subdued); font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .sa-metric__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px; height: 34px;
    border-radius: 10px;
    background: var(--sa-green-soft);
    color: var(--sa-green-dark);
  }
  .sa-metric--info .sa-metric__icon { background: rgba(26, 115, 232, 0.1); color: #1a73e8; }
  .sa-metric--warning .sa-metric__icon { background: rgba(185, 137, 0, 0.14); color: #8a6116; }
  .sa-metric__value { font-size: 34px; font-weight: 680; line-height: 1; letter-spacing: -0.02em; }
  .sa-metric__foot { color: var(--sa-subdued); font-size: 12.5px; }

  /* ---------------------------------------------------------------- filters */
  .sa-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
  .sa-field { display: flex; flex-direction: column; gap: 5px; }
  .sa-field__label { font-size: 12.5px; font-weight: 600; color: var(--sa-text); }
  .sa-field__hint { font-size: 12px; color: var(--sa-subdued); }
  .sa-field__error { font-size: 12.5px; color: var(--sa-critical); }
  .sa-input, .sa-select, .sa-textarea {
    font: inherit;
    color: inherit;
    min-height: 34px;
    padding: 6px 9px;
    border: 1px solid var(--sa-border);
    border-radius: 8px;
    background: #fff;
    min-width: 0;
  }
  .sa-textarea { min-height: 84px; resize: vertical; }
  .sa-input:focus-visible, .sa-select:focus-visible, .sa-textarea:focus-visible {
    outline: 2px solid var(--sa-green);
    outline-offset: -1px;
    border-color: var(--sa-green);
  }
  .sa-input--invalid { border-color: var(--sa-critical); }
  .sa-button--critical { border-color: #f0b5af; color: var(--sa-critical); }
  .sa-button--critical:hover { background: var(--sa-critical-soft); }

  .sa-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font: inherit;
    font-weight: 600;
    min-height: 34px;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--sa-border);
    background: #fff;
    color: var(--sa-text);
    cursor: pointer;
    text-decoration: none;
  }
  .sa-button:hover { background: #f7f8f9; }
  .sa-button:focus-visible { outline: 2px solid var(--sa-green); outline-offset: 1px; }
  .sa-button--primary { background: var(--sa-green); border-color: var(--sa-green); color: #fff; }
  .sa-button--primary:hover { background: var(--sa-green-dark); border-color: var(--sa-green-dark); }
  .sa-button--danger { color: var(--sa-critical); border-color: rgba(180, 35, 24, 0.4); }
  .sa-button--quiet { border-color: transparent; background: transparent; color: var(--sa-green-dark); }
  .sa-button--small { min-height: 28px; padding: 3px 10px; font-size: 13px; }
  .sa-button[disabled] { opacity: 0.55; cursor: not-allowed; }

  /* ----------------------------------------------------------------- tables */
  .sa-table-wrap { overflow-x: auto; border: 1px solid var(--sa-border); border-radius: var(--sa-radius); }
  .sa-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .sa-table th, .sa-table td { padding: 10px 12px; text-align: left; vertical-align: top; }
  .sa-table thead th {
    position: sticky;
    top: 0;
    background: #fbfbfc;
    border-bottom: 1px solid var(--sa-border);
    color: var(--sa-subdued);
    font-size: 11.5px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .sa-table tbody tr + tr td { border-top: 1px solid #eef0f2; }
  .sa-table tbody tr:hover td { background: #fafbfb; }
  .sa-table td.sa-cell--nowrap { white-space: nowrap; }
  .sa-table .sa-primary { font-weight: 600; }
  .sa-table__empty { padding: 26px 12px; text-align: center; color: var(--sa-subdued); }
  .sa-details summary { cursor: pointer; color: var(--sa-green-dark); font-weight: 600; }
  .sa-details summary:focus-visible { outline: 2px solid var(--sa-green); outline-offset: 2px; }
  .sa-details__body { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
  .sa-message {
    white-space: pre-wrap;
    background: #fbfbfc;
    border: 1px solid var(--sa-border);
    border-radius: 10px;
    padding: 10px 12px;
  }

  /* ----------------------------------------------------------------- badges */
  .sa-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .sa-badge--positive { background: rgba(0, 128, 96, 0.1); color: #00664d; }
  .sa-badge--critical { background: #fdecea; color: #a8310b; }
  .sa-badge--warning { background: #fff4e5; color: #8a6116; }
  .sa-badge--info { background: #e8f0fe; color: #1a56c4; }
  .sa-badge--neutral { background: #f1f2f4; color: #5c5f62; }

  /* ------------------------------------------------------------------ misc */
  .sa-banner {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid transparent;
    margin-bottom: 14px;
  }
  .sa-banner--positive { background: rgba(0, 128, 96, 0.08); border-color: rgba(0, 128, 96, 0.3); color: #005c46; }
  .sa-banner--critical { background: #fdecea; border-color: #f3c0bb; color: #a8310b; }
  .sa-banner--warning { background: #fff4e5; border-color: #f0d7a8; color: #7a5709; }
  .sa-banner--info { background: #e8f0fe; border-color: #c4d7fb; color: #1a56c4; }
  .sa-banner__title { font-weight: 650; }

  .sa-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .sa-list__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 2px;
  }
  .sa-list__item + .sa-list__item { border-top: 1px solid #eef0f2; }
  .sa-list__meta { color: var(--sa-subdued); font-size: 12.5px; }

  .sa-empty { padding: 26px 12px; text-align: center; color: var(--sa-subdued); }
  .sa-muted { color: var(--sa-subdued); }
  .sa-nowrap { white-space: nowrap; }
  .sa-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
  .sa-stack { display: flex; flex-direction: column; gap: 12px; }
  .sa-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sa-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .sa-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
  .sa-visually-hidden {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  /* ------------------------------------------------------------------ login */
  .sa-login {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 18px;
    background: var(--sa-bg);
    color: var(--sa-text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
  }
  .sa-login__card {
    width: 100%;
    max-width: 420px;
    background: var(--sa-surface);
    border: 1px solid var(--sa-border);
    border-radius: 18px;
    box-shadow: var(--sa-shadow-lg);
    padding: 30px;
  }
  .sa-login__brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .sa-login__title { margin: 0 0 4px; font-size: 20px; font-weight: 650; }
  .sa-login__hint { margin: 0 0 18px; color: var(--sa-subdued); }

  @media (max-width: 900px) {
    .sa-shell { flex-direction: column; }
    .sa-sidebar {
      position: static;
      height: auto;
      width: 100%;
      flex: 0 0 auto;
      border-right: 0;
      border-bottom: 1px solid var(--sa-border);
    }
    .sa-nav { flex-direction: row; flex-wrap: wrap; }
    .sa-nav__link { border: 1px solid var(--sa-border); }
    .sa-main { padding: 20px 16px 40px; }
  }
`;
