# Speed Scratcher — Working Notes

Short reference so sessions can skip re-exploring. Details live in `README.md`; Shopify rules in `AGENTS.md`.

## What it is

Embedded Shopify app **"Speed Scratcher"**, scaffolded from `shopify-app-template-react-router`. Still mostly template code — no custom app features built yet.

## Stack

- React Router 7.18 + Vite 6, file-based routes (`flatRoutes()` in `app/routes.js`)
- **JS/JSX**, not TS (`tsconfig.json` has `allowJs`, `include` covers only `.ts/.tsx` — JSX files are not type-checked)
- UI: Polaris **web components** (`<s-page>`, `<s-button>`, `<s-section>`…), App Bridge v4
- Prisma 6 + **MongoDB** (Atlas) — sessions only (`Session` model). Conn = `DATABASE_URL` in `.env` (gitignored)
- Shopify CLI drives dev/build/deploy; API version `2027-01` (toml) / `ApiVersion.July26` (code)

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (`shopify app dev`) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` (only `.ts/.tsx`) |
| Build | `npm run build` |
| DB generate + push schema | `npm run setup` (Mongo: no `migrate`, uses `prisma db push`) |

Lockfile: `package-lock.json` (npm). `pnpm-workspace.yaml` also present (`extensions/*` workspace).

## Layout

```
app/
  shopify.server.js      # shopifyApp() config, auth exports
  billing.server.js      # Shopify subscription billing + Mongo sync
  db.server.js           # Prisma client
  lib/
    plans.js             # server-authoritative plan config (3 plans)
    billing.js           # pure billing logic (status mapping, webhook decisions)
    *.test.js            # node:test unit tests (npm test)
  routes.js              # flatRoutes()
  routes/
    app.jsx              # authenticated shell (nav layout + subscription reconcile)
    app._index.jsx       # app home — template demo (productCreate GraphQL)
    app.plan.jsx         # Plan pricing page (/app/plan) + billing action
    app.additional.jsx   # extra nav page
    auth.$jsx, auth.login/  # auth
    webhooks.app.*.jsx   # uninstalled, scopes_update
    webhooks.app_subscriptions.update.jsx  # app subscriptions webhook
    _index/              # marketing/landing page (public)
extensions/theme-extension/   # Liquid theme app extension
  blocks/star_rating.liquid   # reads metafield demo.avg_rating, renders stars
  snippets/stars.liquid
prisma/schema.prisma     # MongoDB datasource + Session model (session_id mapped to _id)
shopify.app.toml         # scopes, webhooks, metafield/metaobject defs
```

## Key facts

- Scopes: `write_products,write_metaobjects,write_metaobject_definitions`
- Webhooks declared **in `shopify.app.toml`**, not `afterAuth`
- Admin GraphQL via `const { admin } = await authenticate.admin(request)` in loaders/actions
- GraphQL codegen configured (`.graphqlrc.js`, `npm run graphql-codegen`)

## Rules when editing

- Embedded app: use `Link` from `react-router` (never `<a>`), `redirect` from `authenticate.admin`, `useSubmit` from `react-router`
- New routes = new files in `app/routes/` (flat routes convention: `app.foo.jsx` → `/app/foo`)
- Don't add tooling to this repo; Shopify API work follows the Shopify AI Toolkit (`AGENTS.md`)

## Git state

Fresh repo — **no commits yet**, everything untracked on `main`.

## Known gotchas

- MongoDB: `prisma migrate` is **not** supported — use `prisma db push`. Prisma Mongo needs a replica set (Atlas free tier is fine)
- `PRISMA_CLIENT_ENGINE_TYPE=binary` if Prisma engine DLL errors on Windows ARM64
- Local dev uses cloudflare tunnel; streaming (`defer`/`await`) needs localhost mode
