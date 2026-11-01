# Deploying — Render (Node host, MongoDB)

Everything here is the checklist for running the next build on
`webspeedy.onrender.com`. The app uses Prisma 6 against MongoDB, and Shopify
App Bridge for the embedded admin UI — both are unforgiving about environment
setup. A misconfigured host shows up as `500 Unexpected Server Error` on the
authenticated data requests, exactly what `https://diamond-builder.onrender.com/app/plan.data`
was returning.

## Why the plan page 500s

`app/routes/app.plan.jsx` only has one code path that is **not** wrapped in a
try/catch: `authenticate.admin(request)`. Everything after it (sync/local
reads) is caught and degraded gracefully. `authenticate.admin` looks the
session up through PrismaSessionStorage → MongoDB. When MongoDB is unreachable,
that lookup **throws**, React Router sanitizes it to
`Unexpected Server Error`, and the admin sees a 500. Unauthenticated requests
(which don't touch the DB) still return 200 — which is why `/` works but the
embedded app pages don't.

The real error is already being printed to the server log by React Router. To
see it:

1. Render dashboard → **webspeedy** → **Logs**.
2. Open the app in the Shopify admin (or reload the broken plan page).
3. Look for a block starting `[unhandled route error] POST/GET https://...` (we
   log the method + URL) and below it the stack. It will almost always be one
   of:
   - `Environment variable not found: DATABASE_URL` → the env var is missing on
     Render.
   - `P1001: Can't reach database server ... at <host>:<port>` → Atlas is
     blocking Render's egress (network access allowlist).
   - `Timed out` on the connection → firewall/allowlist again, or the SRV
     connection string is wrong.
   - A 500 from `authenticate.admin` when the DB is fine → the session row is
     **missing** (e.g. the prod DB has no `Session` collection yet, or the
     merchant's OAuth session was stored somewhere else), which forces the
     library into a Shopify **token exchange**. If Shopify rejects that
     exchange — the usual cause is a `SCOPES` mismatch, or `SHOPIFY_API_SECRET`
     not matching the app — the library turns it into a bare 500 Response and
     React Router sanitizes it to "Unexpected Server Error".

## How auth errors now surface (diagnostics)

`authenticate.admin` failures are no longer silent:

- `app/shopify.server.js` exports `authenticateAdminOrDiagnose`, which wraps
  the library call. Library-managed flows (install, bounce, reauth, exit
  iframe) still throw `Response` objects and behave exactly as before.
- A real failure (rejected token exchange, session DB error) is logged with the
  route name (`[app.loader]`, `[plan.loader]`, `[plan.action]`, …) and returned
  as readable data:
  - `app.jsx` (shell): renders a plain-HTML "The app could not sign you in"
    screen with the message — no more sanitized 500 white-screen.
  - `app.plan.jsx`: the loader puts the message in `authError` and the page
    shows a critical banner; the action returns `{ ok: false, error }` which
    the existing toast displays.
- If you still see `Unexpected Server Error` after deploying, the first place
  to look is the `[unhandled route error]` log line, which now also appears for
  auth failures.

The most common fix for a rejected token exchange (DB fine, collections exist,
yet every authenticated request 500s) is:

1. Make `SCOPES` on Render **exactly** match the scopes the app was installed
   with (check the app in the Partners Dashboard → the app's App setup /
   `shopify app config link` output). A single scope difference makes Shopify
   reject the token exchange.
2. Confirm `SHOPIFY_API_SECRET` on Render matches the Partners Dashboard (copy
   from the Dashboard rather than retyping).
3. If the prod database is new/empty, the merchant must **re-install the app**
   in the store (re-authorize) so an OAuth session row is created there — the
   token-exchange path is a safety net, not a replacement for an installed
   session.

## Required environment variables (Render dashboard → Environment)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your MongoDB connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/speed-scratcher?retryWrites=true&w=majority`. Prisma's MongoDB provider requires this env var — without it every session lookup throws. |
| `SHOPIFY_API_KEY` | The app's API key (already set — the App Bridge script on the deployed pages shows a non-empty key). |
| `SHOPIFY_API_SECRET` | The app's API secret. Session-token verification falls back to a reauthorize flow when this is wrong, so a bad value here causes redirect loops rather than a 500 — but set it anyway. |
| `SCOPES` | e.g. `read_themes,write_products,write_metaobjects,write_metaobject_definitions` — must match what the app requested at install. `read_themes` powers Setup verification. |
| `SHOPIFY_APP_URL` | `https://diamond-builder.onrender.com` — used as the OAuth/app base. The billing `returnUrl` is built from `SHOPIFY_API_KEY` + the shop as the **Shopify admin** URL (`https://admin.shopify.com/store/<shop>/apps/<apiKey>`), not from this value. |
| `BILLING_TEST_MODE` | Set to `true` unless you've created real plans for the app. Billing runs in test mode by default. |
| `PORT` | Render sets this automatically; `react-router-serve` binds to it. |
| `SPEED_SCRATCHER_OPTIMIZATION_SCRIPT_URL` | Optional static storefront optimization script URL. When unset the Setup page shows a clearly-marked placeholder block that loads nothing (no invented endpoints are ever emitted). |
| `SUPPORT_EMAIL_WEBHOOK_URL` | **Optional.** When set, each stored support ticket is POSTed as JSON to this URL (the app's email/notification transport hook). When unset, tickets are stored but nothing is sent and the UI never claims an email was delivered. |

Any change to these requires a **deploy** (or at least a service restart) to
take effect.

## MongoDB network access (Atlas)

Render's egress IPs are dynamic, so if the DB is on Atlas:

1. Atlas → **Network Access** → **Add IP Address**.
2. For a dev store, add `0.0.0.0/0` (allow anywhere) so Render can connect —
   Atlas shows a warning; that's expected during development.
3. For anything beyond development, set up [VPC peering or a static NAT
   egress](https://render.com/docs/static-ip-addresses) and allowlist that range
   instead.

Verify the DB is reachable from the host before blaming anything else:

```
npx prisma db push   # on Render's Shell, or locally against the same DATABASE_URL
```

## Required build / start commands

If the service is configured as a **Node** service on Render:

- Build command: `npm run build` (must run after `npm install` inside the
  build pipeline so `prisma generate` + the platform query engine are created).
- Start command: **`npm run docker-start`** (this runs
  `prisma generate && prisma db push && npm run start`). `prisma db push` is
  what creates the `appSubscription`, `Plan`, `Script`, `ShopProfile`,
  `SetupVerification`, `SupportTicket`
  collections in production.

> ⚠️ **The #1 cause of the `500 Unexpected Server Error` was a plain
> `npm run start` start command.** `prisma db push` only runs locally via `npm
> run setup`, so the production database had `Session` (auth worked, the page
> rendered) but **no `appSubscription` collection** — and the plan/cancel
> actions query that collection, throwing an uncaught Prisma error
> ("collection does not exist") → sanitized 500. `docker-start` fixes this
> every boot, and `/health` now checks the collection explicitly
> (`appSubscriptionOk`).

If you're using the `Dockerfile` in this repo (as a Docker service):

- It now installs **all** deps (`npm ci`; `vite` is a devDependency and is
  required by `react-router build`), generates the Prisma client in-container,
  builds, and starts with `npm run docker-start`.
- The base image is `node:20-bookworm-slim` (Debian/glibc) — Prisma 6's query
  engine is not reliable on Alpine/musl.

## Confirming the fix end-to-end

1. Watch Render logs while you fix the env/network issue — the
   `[unhandled route error]` line (or the boot-time `prisma db push` failure)
   disappears.
2. Reload the embedded app from the Shopify admin: the plan page renders, and
   the session lookup succeeds.
3. Click a plan → the App Bridge redirect takes you to Shopify's hosted
   confirmation page (see `BILLING.md` for the flow).

## Setup & Help pages (what to expect in production)

### Setup verification is presence-based, never fabricated

- Setup reads the storefront script URL from `SPEED_SCRATCHER_OPTIMIZATION_SCRIPT_URL`. When unset the Setup
  page shows a clearly-marked placeholder that loads nothing — no script URL, app
  id or token is ever invented. The merchant copies the single code block into
  theme.liquid and clicks Verify Setup.
- "Verify Setup" reads **two independent sources** from the server (the shop
  always comes from the authenticated session, never the browser):
  1. The published (MAIN) theme's text files, via the Admin GraphQL API
     (`themes` → `theme.files` → `OnlineStoreThemeFileBodyText.content`). This
     is the authoritative check: a script pasted into `theme.liquid` is found
     even when the storefront is password-protected, cached or behind a CDN.
     **Requires the `read_themes` scope** (see below).
  2. The public storefront HTML (`https://<shop>/`), as a best-effort fallback
     that works without the extra scope.
- A marker found in the theme **or** the storefront HTML = verified; a marker
  found in neither readable source = not detected; when neither source can be
  read (e.g. no `read_themes` scope **and** a password-protected/unreachable
  storefront) = "Unable to verify automatically" (overall status `unknown`) —
  the app never reports a false success or a false failure.
- **Placement is checked too.** The script must sit inside `<head>`, just before
  `</head>`. When the marker is found but it is not inside a `<head>` region
  (e.g. it was pasted into the `<body>`), the result is **"Installed outside
  `<head>`"** (`misplaced`) and setup stays **incomplete** — it is never
  reported as verified. The rendered storefront HTML is treated as the truth
  when it carries the script; otherwise the matched theme file is judged. If the
  placement cannot be determined (a snippet with no `<head>`/`<body>`, or an
  unrendered template), the script still verifies with a note.
- **`read_themes` must be granted** for the authoritative theme read. It is in
  `shopify.app.toml` and the `SCOPES` env var. Because changing scopes requires
  a re-authorization, the merchant must **re-open/re-install the app** (Shopify
  prompts for the new permission) after this deploy; until then verification
  silently falls back to the storefront HTML.
- Results (per-script statuses + timestamp) are saved to the `SetupVerification`
  collection per shop. A 30-second per-shop cooldown and a 6-per-5-minutes
  window guard against spam clicks.

### Help page & support tickets

- Submissions are validated and stored as `SupportTicket` rows with a unique
  `SS-XXXXXX` ticket id, the authenticated shop, `status: OPEN` and timestamps.
- Rate limiting (5/hour/shop), a honeypot field and a 2-minute message-dedupe
  window prevent duplicates and spam. Duplicate submissions return the
  original ticket id instead of creating a new row.
- Notifications: if `SUPPORT_EMAIL_WEBHOOK_URL` is configured, a JSON
  notification is POSTed **after** the ticket is stored; if that fails the
  ticket is retained and the failure is logged/surfaced separately. If it is
  **not** configured, nothing is sent and the UI shows no "team notified"
  claim.
- There is no SMTP/email provider wired into this repo yet — wiring one means
  pointing `SUPPORT_EMAIL_WEBHOOK_URL` at your transport (or adding a real
  mailer and updating `notifySupportTicket` in `app/support.server.js`). Do not
  claim email delivery works until that integration is tested.

## Install-time shop profile

- When a merchant installs the app (the `afterAuth` hook in
  `app/shopify.server.js`), the app reads the store's business information from
  the Admin API `Shop` object and stores it in the `ShopProfile` collection,
  keyed by the myshopify domain: store name, owner name, owner email, contact
  email, phone, country / city / province / address, connected (`primary`)
  domain, currency, timezone and plan.
- The app shell loader (`app/routes/app.jsx`) also calls `ensureShopProfile`,
  which creates the record for shops installed before this feature and refreshes
  it at most once every 24h. Both paths are best-effort and never throw, so a
  GraphQL or DB failure can never break install or a page load; nothing is
  fabricated when a field is unavailable.
- This is the merchant's own store business data (from the `Shop` object), never
  customer data. No additional access scopes are required beyond being
  installed.
- `prisma db push` (your `docker-start`) creates the `ShopProfile` collection on
  deploy.

## Plans & pricing (database-managed)

- Subscription plans/prices live in the **`Plan`** collection, not in code. The
  app reads it on every request (no cache), so editing a row changes the app on
  the next page load. `app/plans.server.js` is the only place that reads it.
- On deploy, `prisma db push` (your `docker-start`) creates the `Plan`
  collection. It is **seeded automatically** the first time it is read while
  empty, from the defaults in `app/lib/plans.js` (Basic $9.99, Pro $19.99,
  Advanced $39.99). After that the database is authoritative.
- To change a price: edit `price` on the `Plan` row (MongoDB Atlas / Compass, or
  `npx prisma studio`) and reload the Plan page. Do not rename `key`. Set
  `active: false` to hide a plan without deleting it.
- `app/lib/plans.js` is only the seed + a fallback for an empty/unreachable
  database, so billing keeps working if a read fails.