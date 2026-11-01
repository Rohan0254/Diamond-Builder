# Diamond Builder — Subscription Billing

Internal notes for the Shopify app subscription flow behind the **Plan** tab
(`/app/plan`). See `PROJECT.md` for the overall project and `AGENTS.md` for
Shopify rules.

## Flow

1. The Plan page loader (`app/routes/app.plan.jsx`) verifies the merchant with
   `authenticate.admin`, then reconciles the local MongoDB record with Shopify
   (`syncShopSubscription` in `app/billing.server.js`).
2. Clicking a plan CTA POSTs `intent=select` to the same route.
3. The action loads the live plans from the `Plan` collection (`getPlans` in
   `app/plans.server.js`), validates the plan key against them server-side (never
   trusting a price from the client, and refusing inactive plans), checks for an
   existing active/pending subscription and duplicate pending attempts, then
   calls Shopify's `appSubscriptionCreate` mutation with the database plan's
   price, currency, interval and `trialDays`.
4. The returned `appSubscription` is stored in MongoDB as `PENDING`, and the
   action returns `{ ok: true, confirmationUrl }` as JSON (a fetcher swallows
   server redirects, so the server cannot redirect the top frame itself).
5. The client navigates the top window to Shopify's hosted `confirmationUrl`
   (`window.open(url, "_top")`, the same thing App Bridge's redirect helper
   emits; a bare `window.top.location.assign` throws cross-origin). Failures come
   back as action data and are shown as a toast.
6. The `appSubscriptionCreate` `returnUrl` is the **Shopify admin** URL for the
   app (`https://admin.shopify.com/store/<shop>/apps/<apiKey>/…`, built by
   `buildEmbeddedReturnUrl` in `app/lib/billing.js`): `/app/setup` for a first
   activation, or `/app/plan` when Setup was already completed (for example a
   later plan change). Returning to the admin (rather than the app's own host)
   is what lets the admin re-open the app in its iframe with a session token —
   pointing at the app host instead makes the post-approval **top-window** load
   fall into the embedded auth bounce (`/auth/session-token`), which can strand
   the merchant on a blank page (reproduced on the first install). The shape
   mirrors the default embedded return URL in `@shopify/shopify-api`
   (`buildEmbeddedAppUrl`). Shopify owns the approval/billing and appends the
   numeric `charge_id`. The app shell loader (`app/routes/app.jsx`) then reads
   that `charge_id`, fetches the exact `AppSubscription` by GID
   (`syncSubscriptionFromChargeId` in `app/billing.server.js`) and persists it —
   so the plan is recognised even if the local `PENDING` row is missing or the
   webhook has not arrived yet — and directs the merchant to `/app/setup`. The
   Plan loader reconciles again and the `app_subscriptions/update` webhook keeps
   the record in sync.
7. A subscription is only marked `ACTIVE` after Shopify confirms it. Declined,
   cancelled or expired subscriptions never become active.
8. Cancelling is a separate `intent=cancel` POST that runs Shopify's
   `appSubscriptionCancel` (with proration) from `app/billing.server.js` and
   flips the local record to `CANCELLED`. The Plan page asks for confirmation in
   a Polaris `<s-modal>` first; the result is shown via App Bridge toast.

## Onboarding & navigation

The shell loader (`app/routes/app.jsx`) gates the navigation on billing state:

- **No plan** (no record, or a terminal one: `CANCELLED`/`DECLINED`/`EXPIRED`):
  only **Plan** and **Help** are shown, and any other `/app/*` path redirects to
  `/app/plan`.
- **Plan taken** (`PENDING` or `ACTIVE`): **Plan**, **Setup** and **Help** are
  shown. **Home** stays hidden until the script is verified: the shell reads the
  latest `SetupVerification` and, while `overallStatus !== "complete"`, a request
  for `/app` redirects to `/app/setup`.
- **Setup verified** (`overallStatus === "complete"`): **Home** appears in the nav
  and `/app` renders the dashboard.
- **After approval**: Shopify reloads the app (via its **admin** URL, so the
  embedded session bootstrap runs inside the admin iframe) at the destination baked into the
  `returnUrl` (**Setup** the first time, or **Plan** when Setup was already
  completed). The shell loader persists the exact `charge_id` Shopify returns and
  redirects to `/app/setup`, so the merchant always lands on Setup right after
  paying.
- The Setup page has a **Go to Dashboard** button (disabled until the script is
  verified) that navigates to `/app`.
## Plans & pricing (managed in the database)

The `Plan` collection (MongoDB) is the source of truth for the pricing page and
for the price sent to `appSubscriptionCreate`. The app reads it on every request
(there is no cache), so **editing a row changes the app** on the next page load.

- **Seeding**: the first time the collection is read while empty,
  `app/plans.server.js` inserts the built-in defaults from `app/lib/plans.js`
  (Basic `$9.99`, Pro `$19.99` — most popular, Advanced `$39.99`). After that the
  database wins.
- **Fallback**: `app/lib/plans.js` keeps the default/seed list plus the pure
  transforms (`normalizePlan`, `planToRecord`, `formatPrice`, `findPlanByPrice`,
  …). It is used only to seed or when the collection is empty / the database is
  unreachable, so billing never breaks because of a failed read.
- **Editable fields**: `price`, `name`, `description`, `features` (JSON string
  array), `entitlements` (JSON object keyed by the compare-table rows),
  `popular`, `position` (display order) and `active`. Set `active: false` to hide
  a plan without deleting it — existing subscribers are unaffected. Do **not**
  rename `key` once merchants are subscribed; it is how subscriptions are matched
  back to a plan (`findPlanByPrice`).

### How to change a price

Edit the `price` value on the desired `Plan` row via the MongoDB Atlas UI /
Compass, or `npx prisma studio`. For example set `pro.price` to `24.99`, then
reload the Plan page — new subscriptions use the new price immediately. Existing
subscriptions keep the price Shopify already approved.

## Data model

`AppSubscription` and `Plan` in `prisma/schema.prisma` (MongoDB via Prisma).
`AppSubscription` indexes: `(shop, status)` and `(shopifySubscriptionId)`.
`Plan` is global, keyed by its unique `key`, and indexed by `position`.
Timestamps are real `Date` values. Access tokens and payment details are never
stored.

```bash
# apply the model + indexes to MongoDB (migrate is not supported for Mongo)
npm run setup
```

## Webhooks

Declared in `shopify.app.toml` (not `afterAuth`):

- `app_subscriptions/update` → `/webhooks/app_subscriptions/update`
  (`app/routes/webhooks.app_subscriptions.update.jsx`). HMAC verified by
  `authenticate.webhook`, processed idempotently.

Run `shopify app deploy` to register the webhook with Shopify.

## Environment

| Variable | Purpose |
|---|---|
| `BILLING_TEST_MODE` | `false` to charge for real. Defaults to test charges (safe for dev/demo stores). |

No new scopes are required — app subscription billing works with the existing
scopes.

## Tests

```bash
npm test        # node:test, no extra dependencies
```

Covers successful approval, declined/rejected approvals, GraphQL + user errors,
missing confirmation URLs, webhook status mapping, duplicate webhook events,
duplicate pending detection and plan configuration.

## Not yet verified

Live billing has **not** been exercised against a Shopify development store in
this environment. Before launch: run `shopify app dev` against a dev store,
walk through approve / decline / cancel, and confirm webhook + MongoDB updates.
