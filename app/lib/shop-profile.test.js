import test from "node:test";
import assert from "node:assert/strict";

import {
  SHOP_PROFILE_QUERY,
  normalizeShopProfileResponse,
  shopProfileDisplayName,
  shopProfileLocation,
} from "./shop-profile.js";

const FULL_PAYLOAD = {
  data: {
    shop: {
      id: "gid://shopify/Shop/1",
      name: "Diamond Builder Store",
      shopOwnerName: "Rohan A",
      email: "owner@example.com",
      contactEmail: "support@example.com",
      myshopifyDomain: "speed-scatcher.myshopify.com",
      url: "https://speedscratcher.com",
      currencyCode: "USD",
      ianaTimezone: "America/New_York",
      primaryDomain: { url: "https://speedscratcher.com", host: "speedscratcher.com" },
      shopAddress: {
        address1: "1 Main St",
        address2: "Suite 2",
        city: "New York",
        province: "New York",
        provinceCode: "NY",
        zip: "10001",
        country: "United States",
        countryCodeV2: "US",
        company: "Speed Co",
        phone: "+16135551111",
      },
      plan: {
        publicDisplayName: "Basic",
        shopifyPlus: false,
        partnerDevelopment: true,
      },
    },
  },
};

test("normalizeShopProfileResponse flattens a full shop payload", () => {
  const profile = normalizeShopProfileResponse(FULL_PAYLOAD);
  assert.equal(profile.name, "Diamond Builder Store");
  assert.equal(profile.shopOwnerName, "Rohan A");
  assert.equal(profile.email, "owner@example.com");
  assert.equal(profile.contactEmail, "support@example.com");
  assert.equal(profile.phone, "+16135551111");
  assert.equal(profile.country, "United States");
  assert.equal(profile.countryCode, "US");
  assert.equal(profile.city, "New York");
  assert.equal(profile.province, "New York");
  assert.equal(profile.provinceCode, "NY");
  assert.equal(profile.zip, "10001");
  assert.equal(profile.address1, "1 Main St");
  assert.equal(profile.address2, "Suite 2");
  assert.equal(profile.company, "Speed Co");
  assert.equal(profile.primaryDomain, "https://speedscratcher.com");
  assert.equal(profile.primaryDomainHost, "speedscratcher.com");
  assert.equal(profile.myshopifyDomain, "speed-scatcher.myshopify.com");
  assert.equal(profile.storeUrl, "https://speedscratcher.com");
  assert.equal(profile.currencyCode, "USD");
  assert.equal(profile.timezone, "America/New_York");
  assert.equal(profile.plan, "Basic");
  assert.equal(profile.shopifyPlus, false);
  assert.equal(profile.partnerDevelopment, true);
  assert.deepEqual(profile.raw, FULL_PAYLOAD.data.shop);
});

test("normalizeShopProfileResponse is null-safe for a sparse shop", () => {
  const profile = normalizeShopProfileResponse({ data: { shop: { name: "Bare" } } });
  assert.equal(profile.name, "Bare");
  assert.equal(profile.phone, null);
  assert.equal(profile.country, null);
  assert.equal(profile.primaryDomain, null);
  assert.equal(profile.plan, null);
  assert.equal(profile.shopifyPlus, null);
  assert.equal(profile.partnerDevelopment, null);
});

test("normalizeShopProfileResponse falls back to shop.url for domain", () => {
  const profile = normalizeShopProfileResponse({
    data: { shop: { url: "https://fallback.example", primaryDomain: null } },
  });
  assert.equal(profile.primaryDomain, "https://fallback.example");
  assert.equal(profile.primaryDomainHost, null);
});

test("normalizeShopProfileResponse never invents data", () => {
  assert.equal(normalizeShopProfileResponse(undefined), null);
  assert.equal(normalizeShopProfileResponse(null), null);
  assert.equal(normalizeShopProfileResponse({}), null);
  assert.equal(normalizeShopProfileResponse({ errors: [{ message: "denied" }] }), null);
  assert.equal(normalizeShopProfileResponse({ data: { shop: null } }), null);
});

test("whitespace-only strings become null, never empty strings", () => {
  const profile = normalizeShopProfileResponse({
    data: { shop: { name: "   ", email: "" } },
  });
  assert.equal(profile.name, null);
  assert.equal(profile.email, null);
});

test("shopProfileDisplayName prefers name, then domain, then shop", () => {
  assert.equal(
    shopProfileDisplayName({ name: "N", myshopifyDomain: "d.myshopify.com", shop: "s" }),
    "N",
  );
  assert.equal(shopProfileDisplayName({ name: null, myshopifyDomain: "d.myshopify.com" }), "d.myshopify.com");
  assert.equal(shopProfileDisplayName({ shop: "s" }), "s");
  assert.equal(shopProfileDisplayName(null), null);
});

test("shopProfileLocation joins city, province and country", () => {
  assert.equal(
    shopProfileLocation({ city: "New York", province: "NY", country: "United States" }),
    "New York, NY, United States",
  );
  assert.equal(shopProfileLocation({ country: "Canada" }), "Canada");
  assert.equal(shopProfileLocation({}), null);
});

test("the query reads the fields the normalizer expects", () => {
  for (const field of [
    "shopOwnerName",
    "email",
    "contactEmail",
    "primaryDomain",
    "shopAddress",
    "countryCodeV2",
    "phone",
    "publicDisplayName",
  ]) {
    assert.ok(SHOP_PROFILE_QUERY.includes(field), `query should include ${field}`);
  }
});
