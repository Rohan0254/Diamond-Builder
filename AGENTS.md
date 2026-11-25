# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## MongoDB performance

Apply these rules to every task in this project that touches the database:

- Reuse the shared Prisma client and its connection pool. Do not open or disconnect a client per request.
- Minimize database round trips and the data returned. Select only needed fields, bound or paginate large reads, and batch operations instead of querying inside loops.
- Design indexes around actual filters and sort orders on frequent queries. Reuse existing indexes and avoid redundant indexes that add write overhead. For expensive queries, check the execution plan against representative data when available.
- Keep database logic simple while preserving authorization, correctness, and consistency.

## Product requirements

For BYOR product work, follow the merchant and customer journey in [BYOR-REQUIREMENTS.md](./BYOR-REQUIREMENTS.md).

## Built for Shopify Backend UI & Sidekick AI

- Every merchant admin route (`app/routes/app*.jsx`) must follow **Built for Shopify** guidelines using official Polaris Web Components (`<s-page>`, `<s-section>`, `<s-stack>`, `<s-grid>`, `<s-select>`, `<s-option>`, `<s-switch>`, `<s-checkbox>`, `<s-button>`, `<s-badge>`, `<s-banner>`, `<s-link>`, `<s-table>`) and App Bridge v4 (`useAppBridge()`, `<s-app-nav>`, `<SaveBar>`). Never render raw HTML `<select>` or `<input type="checkbox">` elements in the merchant admin UI, and always use the App Bridge contextual `<SaveBar>` (`@shopify/app-bridge-react`) for unsaved merchant settings changes.
- Never display internal Shopify Page IDs or Collection IDs (`ID #...`) in visible merchant or customer UI; keep ID-based matching strictly in backend storage/metafields and show live clickable storefront URLs (`https://<storeDomain>/pages/...`) instead.
- Keep Shopify Sidekick AI extensions (`[sidekick]` in `shopify.app.toml`, `admin.app.tools.data`, `admin.app.intent.link`) concise (`extensions_summary` <= 256 tokens), non-promotional, bounded in returned rows, and CORS-compatible with `https://extensions.shopifycdn.com`.

