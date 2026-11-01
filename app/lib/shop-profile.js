// Pure shop-profile helpers.
//
// When a merchant installs the app we read their store's business information
// from the Admin API `Shop` object (name, owner, email, phone, country,
// connected domain, plan, …) and store it. Nothing here does IO, so the tricky
// part — turning a GraphQL payload into a flat, null-safe record — is unit
// testable without a network or database. The GraphQL call and persistence live
// in `app/shop-profile.server.js`.

/** The Admin GraphQL query used to read the shop's profile. */
export const SHOP_PROFILE_QUERY = `#graphql
  query SpeedScratcherShopProfile {
    shop {
      id
      name
      shopOwnerName
      email
      contactEmail
      myshopifyDomain
      url
      currencyCode
      ianaTimezone
      primaryDomain {
        url
        host
      }
      shopAddress {
        address1
        address2
        city
        province
        provinceCode
        zip
        country
        countryCodeV2
        company
        phone
      }
      plan {
        publicDisplayName
        shopifyPlus
        partnerDevelopment
      }
    }
  }`;

/** Coerces any value to a trimmed string, or null when empty/absent. */
function str(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Coerces a value to a boolean, or null when it isn't a boolean. */
function bool(value) {
  return typeof value === "boolean" ? value : null;
}

/**
 * Flattens a `SpeedScratcherShopProfile` GraphQL response into a null-safe
 * record. Returns `null` when the payload has no shop (e.g. an error response)
 * so callers never persist fabricated data.
 *
 * @param {unknown} payload Parsed GraphQL JSON (`{ data: { shop } }`).
 * @returns {null | {
 *   shopifyShopId: string|null, name: string|null, shopOwnerName: string|null,
 *   email: string|null, contactEmail: string|null, phone: string|null,
 *   country: string|null, countryCode: string|null, province: string|null,
 *   provinceCode: string|null, city: string|null, address1: string|null,
 *   address2: string|null, zip: string|null, company: string|null,
 *   storeUrl: string|null, primaryDomain: string|null,
 *   primaryDomainHost: string|null, myshopifyDomain: string|null,
 *   currencyCode: string|null, timezone: string|null, plan: string|null,
 *   shopifyPlus: boolean|null, partnerDevelopment: boolean|null, raw: object
 * }}
 */
export function normalizeShopProfileResponse(payload) {
  const shop = payload?.data?.shop;
  if (!shop || typeof shop !== "object") return null;

  const address =
    shop.shopAddress && typeof shop.shopAddress === "object"
      ? shop.shopAddress
      : {};
  const primary =
    shop.primaryDomain && typeof shop.primaryDomain === "object"
      ? shop.primaryDomain
      : {};
  const plan = shop.plan && typeof shop.plan === "object" ? shop.plan : {};

  return {
    shopifyShopId: str(shop.id),
    name: str(shop.name),
    shopOwnerName: str(shop.shopOwnerName),
    email: str(shop.email),
    contactEmail: str(shop.contactEmail),
    phone: str(address.phone),
    country: str(address.country),
    countryCode: str(address.countryCodeV2),
    province: str(address.province),
    provinceCode: str(address.provinceCode),
    city: str(address.city),
    address1: str(address.address1),
    address2: str(address.address2),
    zip: str(address.zip),
    company: str(address.company),
    storeUrl: str(shop.url),
    primaryDomain: str(primary.url) ?? str(shop.url),
    primaryDomainHost: str(primary.host) ?? str(shop.myshopifyDomain),
    myshopifyDomain: str(shop.myshopifyDomain),
    currencyCode: str(shop.currencyCode),
    timezone: str(shop.ianaTimezone),
    plan: str(plan.publicDisplayName),
    shopifyPlus: bool(plan.shopifyPlus),
    partnerDevelopment: bool(plan.partnerDevelopment),
    raw: shop,
  };
}

/**
 * Best-effort display name for a stored profile: the store name, falling back
 * to the myshopify domain. Never fabricates.
 */
export function shopProfileDisplayName(profile) {
  if (!profile) return null;
  return str(profile.name) ?? str(profile.myshopifyDomain) ?? str(profile.shop);
}

/** A single-line location string (city, province, country) or null. */
export function shopProfileLocation(profile) {
  if (!profile) return null;
  const parts = [
    str(profile.city),
    str(profile.province),
    str(profile.country),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
