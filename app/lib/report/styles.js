// Shared PageSpeed report styles (Home dashboard + Performance details).
//
// A single string, injected with <style>{REPORT_CSS}</style> by the routes that
// render the report components. Kept here (rather than duplicated per route) so
// the dashboard's Performance Overview and the details page stay visually
// identical.

export const REPORT_CSS = `
  .psi { max-width: 100%; }

  /* Toolbar (Analyze now) */
  .psi-toolbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin: 0 0 16px;
  }

  /* First-load baseline loader */
  .psi-loading {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; padding: 56px 24px; text-align: center;
    background: #ffffff; border: 1px solid #dadce0; border-radius: 16px;
  }
  .psi-loading s-text { max-width: 460px; }

  .psi-divider { border: 0; border-top: 1px solid #dadce0; margin: 28px 0; }
  .psi-note { font-size: 13px; color: #5f6368; margin: 4px 0 8px; }
  .psi-col-empty { padding: 28px 12px; text-align: center; }
  .psi-compare__empty { padding: 24px 12px; text-align: center; border: 1px dashed #dadce0; border-radius: 12px; }

  /* Side-by-side current/before layout */
  .psi-side-by-side__columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 1200px) {
    .psi-side-by-side__columns { grid-template-columns: 1fr; }
  }
  .psi-side-by-side__col {
    background: #ffffff;
    border: 1px solid #dadce0;
    border-radius: 16px;
    padding: 20px;
  }
  .psi-col-header { margin-bottom: 12px; }
  .psi-col-header--device {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .psi-subdivider { border: 0; border-top: 1px solid #eef0f1; margin: 24px 0; }

  /* Device block inside columns */
  .psi-device-block + .psi-subdivider { margin-top: 20px; }

  /* Score summary */
  .psi-summary {
    display: flex; flex-wrap: wrap; gap: 28px; padding: 20px 8px;
    align-items: flex-start; justify-content: flex-start;
  }
  .psi-summary__item { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 84px; }
  .psi-summary__label { font-size: 13px; color: #5f6368; text-align: center; line-height: 1.3; }
  .psi-agentic__chip {
    display: inline-flex; align-items: center; gap: 6px; border: 1px solid #dadce0;
    border-radius: 999px; padding: 8px 14px; background: #f8f9fa;
    font-weight: 600; font-size: 14px; color: #3c4043; white-space: nowrap;
  }

  /* Score circle */
  .psi-score { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .psi-score__svg { display: block; width: 45px; height: 45px; }
  .psi-score__value { position: absolute; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; font-size: 12px; }
  .psi-score__value svg path, .psi-score__value svg circle { display: none; }

  /* Main report two-column layout */
  .psi-report__main {
    display: grid; grid-template-columns: minmax(0, 1fr) 340px;
    gap: 32px; align-items: start; margin-top: 8px;
  }
  @media (max-width: 960px) { .psi-report__main { grid-template-columns: 1fr; } }
  /* Hidden on both mobile and desktop device blocks (kept for easy restore). */
  .psi-report__main--hidden { display: none; }

  .psi-score-panel { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 0 8px; text-align: center; }

  .psi-legend { width: 100%; max-width: 380px; margin: 6px auto 20px; display: flex; flex-direction: column; gap: 6px; }
  .psi-legend__row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #5f6368; }
  .psi-legend__dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .psi-legend__range { margin-left: auto; font-variant-numeric: tabular-nums; }

  /* Metrics */
  .psi-metrics { border: 1px solid #dadce0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
  .psi-metrics__row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid #eef0f1; }
  .psi-metrics__row:last-child { border-bottom: 0; }
  .psi-metrics__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .psi-metrics__name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .psi-metrics__title { font-size: 14px; color: #202124; }
  .psi-metrics__short { font-size: 12px; color: #9aa0a6; font-variant-numeric: tabular-nums; }
  .psi-metrics__status { margin-left: auto; font-size: 12px; white-space: nowrap; }
  .psi-metrics__value { margin-left: 10px; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Store preview */
  .psi-preview { display: flex; justify-content: center; padding: 8px 0 4px; }
  .psi-preview__chrome { border: 1px solid #dadce0; border-radius: 14px; background: #fff; box-shadow: 0 1px 3px rgba(60, 64, 67, 0.15); overflow: hidden; }
  .psi-preview--desktop .psi-preview__chrome { width: 100%; max-width: 460px; }
  .psi-preview--mobile .psi-preview__chrome { width: 230px; }
  .psi-preview__bar { display: flex; gap: 6px; align-items: center; padding: 9px 12px; background: #f1f3f4; border-bottom: 1px solid #e5e6e8; }
  .psi-preview__dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .psi-preview__dot--red { background: #ea4335; }
  .psi-preview__dot--amber { background: #fbbc04; }
  .psi-preview__dot--green { background: #34a853; }
  .psi-preview__body { position: relative; aspect-ratio: 16 / 10; background: #fafbfc; }
  .psi-preview--mobile .psi-preview__body { aspect-ratio: 9 / 16; }
  .psi-preview__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .psi-preview__placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 20px; text-align: center; }
  .psi-report__meta { margin-top: 12px; text-align: center; }

  /* See more accordion (metrics + audits) */
  .psi-seemore {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 6px; padding: 12px 16px;
    background: #fff; border: 1px solid #dadce0; border-radius: 12px;
    font: inherit; font-size: 14px; font-weight: 500; color: #1a73e8; cursor: pointer;
  }
  .psi-seemore:hover { background: #f8f9fa; }
  .psi-seemore:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
  .psi-seemore-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s ease; }
  .psi-seemore-wrap--open { grid-template-rows: 1fr; }
  .psi-seemore-inner { overflow: hidden; min-height: 0; }
  .psi-seemore-content { margin-top: 14px; display: flex; flex-direction: column; gap: 20px; }

  /* Audit groups */
  .psi-audits { display: flex; flex-direction: column; gap: 12px; }
  .psi-audit-group { border: 1px solid #dadce0; border-radius: 12px; overflow: hidden; }
  .psi-audit-group__header {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px;
    background: #f8f9fa; border: 0; font: inherit; font-size: 14px; font-weight: 600;
    color: #202124; cursor: pointer; text-align: left;
  }
  .psi-audit-group__header:hover { background: #f1f3f4; }
  .psi-audit-group__count { margin-left: auto; font-size: 12px; color: #5f6368; font-weight: 500; }
  .psi-audit { border-bottom: 1px solid #eef0f1; }
  .psi-audit:last-child { border-bottom: 0; }
  .psi-audit__trigger {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px;
    background: #fff; border: 0; font: inherit; text-align: left; cursor: pointer;
  }
  .psi-audit__trigger:hover { background: #fafbfc; }
  .psi-audit__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .psi-audit__title { font-size: 14px; color: #202124; }
  .psi-audit__savings { margin-left: auto; flex-shrink: 0; font-size: 12px; font-weight: 600; color: #174ea6; background: #e8f0fe; border-radius: 999px; padding: 3px 10px; }
  .psi-audit__caret { color: #5f6368; flex-shrink: 0; }
  .psi-audit__detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.2s ease; }
  .psi-audit__detail-inner { overflow: hidden; min-height: 0; }
  .psi-audit__detail--open { grid-template-rows: 1fr; }
  .psi-audit__detail-content { padding: 0 16px 14px 42px; }

  /* Comparison */
  .psi-compare__header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
  }
  .psi-compare__heading { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .psi-compare__table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #dadce0; border-radius: 12px; overflow: hidden; }
  .psi-compare__table th {
    text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;
    color: #5f6368; padding: 10px 12px; background: #f8f9fa; font-weight: 600;
  }
  .psi-compare__table td { padding: 12px; font-size: 14px; vertical-align: middle; }
  .psi-compare__row:not(:last-child) td { border-bottom: 1px solid #eef0f1; }
  .psi-compare__label { font-weight: 500; color: #202124; }
  .psi-compare__value { font-variant-numeric: tabular-nums; }
  .psi-compare__value--after { font-weight: 600; }
  .psi-compare__delta { font-weight: 600; white-space: nowrap; }
  .psi-compare__delta-text { display: inline-flex; align-items: center; gap: 6px; }
  .psi-compare__row--improved .psi-compare__delta-text { color: #0b8043; }
  .psi-compare__row--worsened .psi-compare__delta-text { color: #d93025; }
  .psi-compare__row--improved td { background: rgba(11, 128, 67, 0.05); }
  .psi-compare__row--worsened td { background: rgba(217, 48, 37, 0.05); }
  .psi-compare__row:hover td { background: #f8f9fa; }
  .psi-compare__delta-text s-icon { vertical-align: middle; }
  .psi-compare__missing { color: #9aa0a6; font-weight: 400; }
  .psi-compare__note { margin-top: 14px; }

  /* Device switcher — compact segmented control */
  .psi-tabs {
    display: inline-flex; gap: 2px; padding: 3px; flex-shrink: 0;
    background: #f1f3f4; border-radius: 999px;
  }
  .psi-tabs--bordered { border-bottom: 0; margin: 0; }
  .psi-tabs__tab {
    display: inline-flex; align-items: center; gap: 6px;
    border: 0; background: transparent; cursor: pointer; font: inherit;
    font-size: 13px; font-weight: 500; line-height: 1; color: #5f6368;
    padding: 7px 14px; border-radius: 999px;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .psi-tabs__tab:hover { color: #202124; }
  .psi-tabs__tab--active {
    background: #ffffff; color: #1a73e8;
    box-shadow: 0 1px 2px rgba(60, 64, 67, 0.2);
  }
  .psi-tabs__tab:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }

  /* Responsive: scroll the score summary instead of cramping it */
  @media (max-width: 700px) {
    .psi-summary { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 12px; }
  }

  /* ------------------------------------------------------------------ */
  /* Performance Overview (Before vs. After hero)                        */
  /* ------------------------------------------------------------------ */
  .psi-ov {
    background: #ffffff; border: 1px solid #e3e5e8; border-radius: 16px;
    box-shadow: 0 1px 2px rgba(60, 64, 67, 0.08);
    padding: 20px 20px 24px; margin: 0 0 28px;
  }
  .psi-ov__header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 20px;
  }
  .psi-ov__heading { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  /* 50/50 dashboard: performance (chart + metrics) | SEO & Site Health */
  .psi-ov__dashboard {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px; align-items: start;
  }
  .psi-ov__pane { min-width: 0; }
  .psi-ov__pane--perf { display: flex; flex-direction: column; }
  .psi-ov__pane--seo { padding-left: 28px; border-left: 1px solid #eef0f1; }
  @media (max-width: 990px) {
    .psi-ov__dashboard { grid-template-columns: minmax(0, 1fr); }
    .psi-ov__pane--seo {
      padding-left: 0; padding-top: 24px;
      border-left: 0; border-top: 1px solid #eef0f1;
    }
  }

  .psi-ov__chart-card { animation: psi-ov-fade 0.3s ease; }
  @keyframes psi-ov-fade {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
  .psi-ov__chart-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
  }
  /* Date-range + device strips sit together on the heading line. Keeping them
     nowrap holds both on one line; if the row runs out of room the whole group
     moves below the heading instead of splitting up. */
  .psi-ov__chart-controls {
    display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0;
  }
  /* Two strips share one line in a half-width column, so keep them compact. */
  .psi-ov__chart-controls .psi-tabs__tab { padding: 7px 11px; font-size: 12.5px; }
  .psi-ov__legend {
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    list-style: none; margin: 0 0 6px; padding: 0; font-size: 13px; color: #5f6368;
  }
  .psi-ov__legend li { display: inline-flex; align-items: center; gap: 8px; }
  .psi-ov__legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* Chart */
  .psi-chart__canvas { position: relative; width: 100%; }
  .psi-chart__svg { display: block; width: 100%; height: auto; }
  .psi-chart__grid { stroke: #eef0f1; stroke-width: 1; }
  .psi-chart__tick { fill: #80868b; font-size: 12px; }
  .psi-chart__xlabel { fill: #3c4043; font-size: 13px; font-weight: 500; }
  .psi-chart__xdate { fill: #80868b; font-size: 11px; }
  .psi-chart__line { stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; transition: opacity 0.2s ease; }
  .psi-chart__point { fill: #ffffff; stroke-width: 3; }
  .psi-chart__guide { stroke: #dadce0; stroke-width: 1; stroke-dasharray: 4 4; }
  .psi-chart__hit {
    position: absolute; top: 0; bottom: 0; transform: translateX(-50%);
    padding: 0; margin: 0;
    border: 0; background: transparent; cursor: pointer;
  }
  .psi-chart__hit:focus-visible { outline: 2px solid #1a73e8; outline-offset: -4px; border-radius: 8px; }
  .psi-chart__tooltip {
    position: absolute; transform: translate(-50%, calc(-100% - 10px));
    display: flex; flex-direction: column; gap: 2px;
    padding: 8px 10px; border-radius: 8px; background: #202124; color: #ffffff;
    font-size: 12px; line-height: 1.5; white-space: nowrap;
    pointer-events: none; z-index: 3; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
  }
  .psi-chart__tooltip-date { color: #bdc1c6; font-weight: 600; }
  .psi-chart__tooltip-row { display: inline-flex; align-items: center; gap: 6px; }
  .psi-chart__tooltip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  /* Summary panel */
  .psi-ov__summary { margin-top: 22px; }
  .psi-ov__summary-inner {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }
  .psi-ov__metric {
    border: 1px solid #eef0f1; border-radius: 12px; padding: 12px 14px;
    background: #fbfcfd;
  }
  .psi-ov__metric-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 8px;
  }
  .psi-ov__metric-label { font-size: 13px; font-weight: 600; color: #3c4043; }
  .psi-ov__metric-values { display: flex; align-items: baseline; gap: 8px; }
  .psi-ov__metric-before { font-size: 14px; color: #80868b; font-variant-numeric: tabular-nums; }
  .psi-ov__metric-sep { color: #bdc1c6; font-size: 13px; }
  .psi-ov__metric-after { font-size: 22px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }

  .psi-ov__delta { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .psi-ov__delta--improved { color: #0b8043; }
  .psi-ov__delta--worsened { color: #d93025; }
  .psi-ov__delta--same { color: #5f6368; }
  .psi-ov__delta--missing { color: #80868b; font-weight: 500; }

  /* See more details */
  .psi-ov__cta { display: flex; justify-content: center; margin-top: 22px; }

  .psi-ov__empty {
    padding: 40px 16px; text-align: center;
    border: 1px dashed #dadce0; border-radius: 12px;
  }
  .psi-ov__note { margin-top: 14px; }

  /* ------------------------------------------------------------------ */
  /* SEO & Site Health (dashboard column + audit page)                   */
  /* ------------------------------------------------------------------ */
  .psi-seo { display: flex; flex-direction: column; gap: 14px; }
  .psi-seo__head { display: flex; flex-direction: column; gap: 6px; }

  .psi-seo__health {
    display: flex; align-items: flex-start; gap: 10px;
    border: 1px solid #e8eaed; border-radius: 12px; padding: 12px 14px;
    background: #f8f9fa;
  }
  .psi-seo__health-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .psi-seo__health-label { font-size: 13px; font-weight: 700; line-height: 1.2; }
  .psi-seo__health-detail { font-size: 12.5px; line-height: 1.45; }
  .psi-seo__health--healthy { background: #e6f4ea; border-color: #ceead6; color: #0b8043; }
  .psi-seo__health--warning { background: #fef7e0; border-color: #feefc3; color: #a05a00; }
  .psi-seo__health--critical { background: #fce8e6; border-color: #fad2cf; color: #b3261e; }
  .psi-seo__health--unknown { background: #e8f0fe; border-color: #d2e3fc; color: #174ea6; }

  .psi-seo__list {
    display: flex; flex-direction: column; gap: 10px;
    list-style: none; margin: 0; padding: 0;
  }

  .psi-seo__card {
    display: flex; align-items: flex-start; gap: 12px; width: 100%;
    padding: 13px 14px; text-align: left; font: inherit; cursor: pointer;
    background: #ffffff; border: 1px solid #e8eaed; border-radius: 12px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }
  .psi-seo__card:hover {
    background: #fbfcfd; border-color: #dadce0;
    box-shadow: 0 1px 4px rgba(60, 64, 67, 0.12);
  }
  .psi-seo__card:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }

  .psi-seo__icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 9px;
    background: #f1f3f4; color: #5f6368;
  }
  .psi-seo__card--critical .psi-seo__icon,
  .psi-seo-audit--critical .psi-seo__icon { background: #fce8e6; color: #c5221f; }
  .psi-seo__card--warning .psi-seo__icon,
  .psi-seo-audit--warning .psi-seo__icon { background: #fef7e0; color: #b06000; }
  .psi-seo__card--info .psi-seo__icon,
  .psi-seo-audit--info .psi-seo__icon { background: #e8f0fe; color: #1a73e8; }
  .psi-seo__card--healthy .psi-seo__icon,
  .psi-seo-audit--healthy .psi-seo__icon { background: #e6f4ea; color: #0b8043; }

  .psi-seo__card-body { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-width: 0; }
  .psi-seo__card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .psi-seo__card-title { font-size: 14px; font-weight: 600; color: #202124; }
  .psi-seo__card-desc { font-size: 12.5px; line-height: 1.45; color: #5f6368; }
  .psi-seo__chevron { flex-shrink: 0; margin-top: 1px; color: #9aa0a6; }

  .psi-seo__badge {
    flex-shrink: 0; padding: 5px 9px; border-radius: 999px; white-space: nowrap;
    font-size: 11px; font-weight: 700; line-height: 1;
    background: #f1f3f4; color: #5f6368;
  }
  .psi-seo__badge--critical { background: #fce8e6; color: #b3261e; }
  .psi-seo__badge--warning { background: #fef7e0; color: #a05a00; }
  .psi-seo__badge--info { background: #e8f0fe; color: #174ea6; }
  .psi-seo__badge--healthy { background: #e6f4ea; color: #0b8043; }

  .psi-seo__footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .psi-seo__link {
    border: 0; background: transparent; padding: 4px 0; cursor: pointer;
    font: inherit; font-size: 13px; font-weight: 600; color: #1a73e8;
  }
  .psi-seo__link:hover { text-decoration: underline; }
  .psi-seo__link:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; border-radius: 4px; }
  .psi-seo__link-row { margin: 18px 0 0; }

  /* SEO audit page */
  .psi-seo-report__meta { margin: 14px 0 0; font-size: 13px; color: #5f6368; }
  .psi-seo-report__list { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
  .psi-seo-audit {
    background: #ffffff; border: 1px solid #e3e5e8; border-radius: 14px;
    padding: 18px 18px 20px; scroll-margin-top: 16px;
  }
  .psi-seo-audit__head { display: flex; align-items: flex-start; gap: 12px; }
  .psi-seo-audit__titles { display: flex; flex-direction: column; gap: 5px; flex: 1 1 auto; min-width: 0; }
  .psi-seo-audit__note { margin: 14px 0 0; font-size: 13px; color: #5f6368; }
  .psi-seo-audit__note--ok { color: #0b8043; }
  .psi-seo-audit__breakdown {
    display: flex; flex-wrap: wrap; gap: 10px;
    list-style: none; margin: 14px 0 0; padding: 0;
  }
  .psi-seo-audit__breakdown li {
    display: inline-flex; align-items: center; gap: 8px;
    border: 1px solid #eef0f1; border-radius: 999px; padding: 6px 12px;
    font-size: 12.5px; color: #5f6368; background: #fbfcfd;
  }
  .psi-seo-audit__breakdown strong { color: #202124; }
  .psi-seo-audit__findings {
    list-style: none; margin: 14px 0 0; padding: 0;
    border: 1px solid #eef0f1; border-radius: 10px; overflow: hidden;
  }
  .psi-seo-audit__findings li {
    display: flex; flex-direction: column; gap: 3px;
    padding: 10px 14px; border-bottom: 1px solid #eef0f1;
  }
  .psi-seo-audit__findings li:last-child { border-bottom: 0; }
  .psi-seo-audit__finding-main { font-size: 13px; color: #202124; word-break: break-all; }
  .psi-seo-audit__finding-meta { font-size: 12px; color: #80868b; word-break: break-word; }

  @media (max-width: 700px) {
    .psi-seo__card { padding: 12px; }
    .psi-seo-audit { padding: 16px 14px 18px; }
  }
`;
