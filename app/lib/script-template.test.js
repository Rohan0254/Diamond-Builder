import test from "node:test";
import assert from "node:assert/strict";

import {
  SCRIPT_PLACEHOLDERS,
  applyScriptPlaceholders,
  buildScriptVariables,
  hostFromUrl,
  normalizeScriptPlatform,
  pickScriptTemplate,
  templateContent,
} from "./script-template.js";

test("normalizeScriptPlatform maps known platforms and defaults to custom", () => {
  assert.equal(normalizeScriptPlatform("Shopify"), "shopify");
  assert.equal(normalizeScriptPlatform("BIG-COMMERCE"), "bigcommerce");
  assert.equal(normalizeScriptPlatform("wix"), "wix");
  assert.equal(normalizeScriptPlatform("mystery"), "custom");
  assert.equal(normalizeScriptPlatform(""), "custom");
  assert.equal(normalizeScriptPlatform(undefined), "custom");
});

test("templateContent accepts the string and object shapes a row can take", () => {
  assert.equal(templateContent("  hello  "), "  hello  ");
  assert.equal(templateContent({ code: "from-code" }), "from-code");
  assert.equal(templateContent({ script: "from-script" }), "from-script");
  assert.equal(templateContent({ template: "from-template" }), "from-template");
  assert.equal(templateContent({ content: "from-content" }), "from-content");
  assert.equal(templateContent({ value: "from-value" }), "from-value");
  assert.equal(templateContent({ code: "   " }), "");
  assert.equal(templateContent({ unrelated: "x" }), "");
  assert.equal(templateContent(["a"]), "");
  assert.equal(templateContent(null), "");
});

test("pickScriptTemplate prefers the platform column and falls back to default", () => {
  const record = {
    shopify: "SHOPIFY TEMPLATE",
    default: "DEFAULT TEMPLATE",
  };
  assert.deepEqual(pickScriptTemplate(record, "shopify"), {
    content: "SHOPIFY TEMPLATE",
    source: "shopify",
  });
  // An empty platform column falls through to `default`.
  assert.deepEqual(pickScriptTemplate({ shopify: "  " , default: "D" }, "shopify"), {
    content: "D",
    source: "default",
  });
  // Unknown platform still resolves the default column.
  assert.deepEqual(pickScriptTemplate({ default: "D" }, "mystery"), {
    content: "D",
    source: "default",
  });
  assert.deepEqual(pickScriptTemplate(null, "shopify"), {
    content: "",
    source: null,
  });
  assert.deepEqual(pickScriptTemplate({}, "shopify"), {
    content: "",
    source: null,
  });
});

test("hostFromUrl is null-safe", () => {
  assert.equal(hostFromUrl("https://shop.example.com/path"), "shop.example.com");
  assert.equal(hostFromUrl("not a url"), "");
  assert.equal(hostFromUrl(""), "");
  assert.equal(hostFromUrl(null), "");
});

test("buildScriptVariables derives the host when domain is absent", () => {
  const vars = buildScriptVariables({
    userId: "64f0abc",
    platform: "Shopify",
    websiteId: "64f0abc",
    websiteUrl: "https://example.myshopify.com",
  });
  assert.equal(vars.USER_ID, "64f0abc");
  assert.equal(vars.WEBSITE_ID, "64f0abc");
  assert.equal(vars.PLATFORM, "Shopify");
  assert.equal(vars.WEBSITE_URL, "https://example.myshopify.com");
  assert.equal(vars.DOMAIN, "example.myshopify.com");

  const explicit = buildScriptVariables({
    userId: 15,
    websiteId: 15,
    domain: "example.com",
  });
  assert.equal(explicit.USER_ID, "15");
  assert.equal(explicit.DOMAIN, "example.com");
});

test("applyScriptPlaceholders replaces every known token and blanks unknown ones", () => {
  const template =
    "uid={{USER_ID}};p={{PLATFORM}};w={{WEBSITE_ID}};u={{WEBSITE_URL}};d={{DOMAIN}};{{NOPE}}";
  const output = applyScriptPlaceholders(
    template,
    buildScriptVariables({
      userId: 15,
      websiteId: 15,
      websiteUrl: "https://example.com",
      platform: "Shopify",
    }),
  );
  assert.equal(
    output,
    "uid=15;p=Shopify;w=15;u=https://example.com;d=example.com;",
  );
  // All documented placeholders are covered.
  assert.deepEqual(SCRIPT_PLACEHOLDERS, [
    "USER_ID",
    "PLATFORM",
    "WEBSITE_ID",
    "WEBSITE_URL",
    "DOMAIN",
  ]);
});

test("applyScriptPlaceholders is null-safe", () => {
  assert.equal(applyScriptPlaceholders(null, {}), "");
  assert.equal(applyScriptPlaceholders("plain", undefined), "plain");
});
