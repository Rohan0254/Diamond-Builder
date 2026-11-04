# Build Your Own Ring (BYOR)

Diamond Builder lets merchants on Shopify, WordPress, BigCommerce, and future platforms offer a ring builder on their storefront. The app serves the diamond listing. The customer shops on the merchant's store and chooses the diamond and ring that they want to purchase together.

## First milestone: diamond categories and imports

1. Staff create a diamond category in the admin panel.
2. Staff select the destination category before importing diamonds. Each successfully imported diamond is associated with that category. An import without a valid category must not create uncategorized diamonds.
3. The storefront requests diamonds for a selected category through the app API. The API returns a paginated listing scoped to that category. An empty category returns an empty listing.
4. The merchant's diamond listing page displays those results and links each diamond to its detail page.

Acceptance check: Create two categories, import diamonds into the first, and request each category through the API. The first listing contains its imported diamonds; the second stays empty. This milestone precedes ring selection and cart work.

## Customer journey

| Step | Customer action | Expected result |
| --- | --- | --- |
| 1. Browse diamonds | Open the diamond listing on the merchant's storefront. | The customer sees diamonds supplied by the app. |
| 2. Select a diamond | Open a diamond's detail page and select it. | The builder carries that specific diamond into ring selection. |
| 3. Choose a ring | Choose a ring setting for the selected diamond. | The builder retains both selections for review. |
| 4. Review the ring | Review the selected diamond and ring setting together. | The customer can confirm the combination before adding it to the cart. |
| 5. Add to cart | Add the reviewed combination to the merchant's cart. | The cart identifies the same diamond and ring setting the customer reviewed. |

## Acceptance criterion

A customer can start on a merchant's diamond listing, choose a diamond and a ring, and reach that merchant's cart with both selections preserved. Opening a detail page or choosing a setting does not itself add anything to the cart.

## Decisions still open

The source of ring settings, compatibility rules, pricing, inventory reservation, and how the combination is represented in Shopify's cart are not yet specified. These are implementation decisions to settle when designing the corresponding feature.

## Multi-platform hosted listing

This project hosts one shared customer listing UI embedded in merchant webpages through an iframe. Platform-specific installation, authentication, lifecycle, embed bridges, and cart adapters belong in app/integrations/<platform>. Shared diamond logic belongs in app/features/diamonds; customer listing UI belongs in app/features/listing.

The server identifies the merchant and platform from a verified integration context and serves the common UI with that merchant's settings and permitted catalog. Caller-supplied domain or platform labels alone never authorize catalog access. Keep the shared Prisma pool, bounded queries, and query-specific indexes for every platform. Follow ARCHITECTURE.md for ownership and implementation stages.

These requirements extend the project scope; customer iframe routes and additional platform integrations are future implementation work. WordPress commerce support and cart representation per platform remain open decisions.