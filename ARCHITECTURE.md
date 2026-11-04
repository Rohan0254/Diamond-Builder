# BYOR multi-platform architecture

## Product scope

This project hosts one customer diamond listing UI. Merchants embed it in webpages using an iframe. Shopify, WordPress, BigCommerce, and future integrations reuse the same listing, details, and builder journey.

## Folder ownership

| Folder | Responsibility |
| --- | --- |
| app/routes/ | Thin React Router HTTP entry points; retain the flat route convention. |
| app/features/diamonds/ | Platform-neutral diamond presentation and future catalog query services. |
| app/features/listing/ | Shared customer iframe UI, filters, detail view, theme configuration, and builder state. |
| app/integrations/shopify/ | Shopify installation/authentication, lifecycle, storefront bridge, cart adapter as migrated or implemented. |
| app/integrations/wordpress/ | WordPress plugin connection, storefront bridge, commerce/cart adapter. |
| app/integrations/bigcommerce/ | BigCommerce installation/authentication, lifecycle, storefront bridge, cart adapter. |
| app/components/admin/ and app/lib/admin/ | Internal staff UI and authorization. |
| app/db.server.js | Existing shared Prisma instance and pool for every platform. |
| prisma/ | Shared schema and indexes. |

Routes delegate to features and integration adapters. Shared features must not import platform SDKs. Platform adapters produce a common verified merchant context and translate cart operations.

Current status: shared diamond title generation has been extracted and reused by the admin table. Integration and listing directories establish ownership for subsequent implementation. Existing Shopify files remain at their current paths until their imports and behavior can be migrated together. Public iframe routes, shared installation records, and platform adapters are not implemented yet.

## Proposed server request flow

1. Verify a merchant installation using the selected platform's supported authentication mechanism.
2. Store a common merchant identity, platform installation, active status, permitted storefront origins, catalog visibility, and UI settings. Explicitly map existing Shopify shop records into this model in a separate migration.
3. The integration embeds this application's proposed /embed/diamonds URL.
4. Issue a short-lived signed embed context with installation identity, audience, expiry, and allowed origin. Backend credentials stay server-side. Public bootstrap contexts grant only explicitly public catalog access.
5. Verify the context server-side and resolve the active installation. Derive the platform, merchant, catalog permissions, and UI configuration from the stored installation.
6. Serve the shared listing and proposed /api/storefront/v1/diamonds endpoint. Each API request independently verifies context and applies merchant catalog visibility before user filters.
7. Keep diamond/ring selections in the common builder; the verified installation determines which cart adapter handles the reviewed combination.

A platform/domain URL parameter, referrer, Origin header, or browser message alone never authorizes a merchant context. Unknown, inactive, invalid, and expired installations fail closed. Public embed credentials never grant staff admin, merchant admin, billing, or access to platform credentials.

## Iframe integration contract

- Serve the customer iframe over HTTPS in production.
- Set CSP frame-ancestors using verified storefront origins. Keep admin framing rules separate.
- Avoid relying on third-party cookies for iframe context.
- Define versioned ready, resize, diamond-selected, ring-selected, and cart-request messages.
- Validate message origin, source window, type, and payload on both sides. Use exact target origins.
- Revalidate price, availability, merchant visibility, and selections server-side before cart operations.
- Keep one customer UI, configured by the verified merchant context; do not fork it per platform.
- Shopify theme integration should use theme app extensions where applicable. Merchant admin embedding is a separate surface. Reference: https://shopify.dev/docs/apps/build/online-store

## Database rules

Reuse app/db.server.js and its pool. Select required fields, paginate with bounded cursors, batch related reads, and avoid queries per row. Apply merchant scope before filters, sorting, and counts. Use the identical scoped predicate for listing and count.

Resolve merchant context once per request. Any permission cache requires explicit invalidation. Design indexes around actual merchant scope, filters, and sort combinations; inspect representative execution plans before adding speculative indexes.

## Stages

1. Folder ownership, scope documentation, and shared diamond presentation (this change).
2. Shared merchant/installation schema, platform verification, and signed embed contract.
3. Common iframe listing and scoped catalog API, integrated with one platform end to end.
4. Additional WordPress and BigCommerce adapters.
5. Ring selection, review, and cart adapters.

Open decisions: ring source, pricing rules, inventory reservation, cart representation on each platform, supported WordPress commerce plugin, and migration from existing Shopify shop records.
