import test from "node:test";
import assert from "node:assert/strict";

import {
  BUNNY_DEFAULT_STORAGE_HOSTNAME,
  getFileInfo,
  getScriptFilename,
  getUserCdnUrl,
  getUserScriptPath,
  isBunnyConfigured,
  purgeCache,
  readBunnyConfig,
  uploadFile,
} from "./bunny.js";

const CONFIG = {
  apiKey: "main-key",
  storageZone: "speed-zone",
  storageHostname: "storage.bunnycdn.com",
  cdnUrl: "https://speed.b-cdn.net",
  storagePassword: "storage-pass",
  purgeApiKey: "purge-key",
  obfuscate: true,
};

/** Minimal Response-like object for the fake fetch. */
function makeResponse(status, headers = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
  };
}

test("readBunnyConfig reads the env, defaults the host and purge key", () => {
  const config = readBunnyConfig({
    BUNNY_API_KEY: "k",
    BUNNY_STORAGE_ZONE: "zone",
    BUNNY_STORAGE_PASSWORD: "pass",
    BUNNY_CDN_URL: "https://cdn.example.test/",
  });
  assert.equal(config.storageHostname, BUNNY_DEFAULT_STORAGE_HOSTNAME);
  assert.equal(config.cdnUrl, "https://cdn.example.test");
  assert.equal(config.purgeApiKey, "k");
  assert.equal(config.obfuscate, true);

  const noObfuscate = readBunnyConfig({ BUNNY_SCRIPT_OBFUSCATE: "false" });
  assert.equal(noObfuscate.obfuscate, false);
});

test("isBunnyConfigured requires zone, password and CDN URL", () => {
  assert.equal(isBunnyConfigured(CONFIG), true);
  assert.equal(isBunnyConfigured({ ...CONFIG, storagePassword: "" }), false);
  assert.equal(isBunnyConfigured({ ...CONFIG, storageZone: "" }), false);
  assert.equal(isBunnyConfigured({ ...CONFIG, cdnUrl: "" }), false);
  assert.equal(isBunnyConfigured(null), false);
});

test("the per-user path and CDN URL follow the legacy layout", () => {
  assert.equal(getScriptFilename(15), "scrachar_15.js");
  assert.equal(getUserScriptPath(15), "scripts/15/scrachar_15.js");
  assert.equal(
    getUserCdnUrl(CONFIG, 15),
    "https://speed.b-cdn.net/scripts/15/scrachar_15.js",
  );
});

test("getFileInfo treats 404 as a clean 'not exists'", async () => {
  const result = await getFileInfo({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    fetchImpl: async () => makeResponse(404),
  });
  assert.equal(result.success, true);
  assert.equal(result.exists, false);
});

test("getFileInfo reads the size from a ranged 206 response", async () => {
  let seenOptions;
  const result = await getFileInfo({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    fetchImpl: async (url, options) => {
      seenOptions = options;
      return makeResponse(206, { "content-range": "bytes 0-0/4242" });
    },
  });
  assert.equal(result.exists, true);
  assert.equal(result.size, 4242);
  assert.equal(seenOptions.headers.AccessKey, "storage-pass");
  assert.equal(seenOptions.headers.Range, "bytes=0-0");
});

test("getFileInfo reports auth failures without throwing", async () => {
  const result = await getFileInfo({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    fetchImpl: async () => makeResponse(401),
  });
  assert.equal(result.success, false);
  assert.equal(result.exists, false);
  assert.match(result.message, /401/);
});

test("uploadFile PUTs the content to the storage zone", async () => {
  let seen;
  const result = await uploadFile({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    content: "console.log(1)",
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return makeResponse(201);
    },
  });
  assert.equal(result.success, true);
  assert.equal(
    seen.url,
    "https://storage.bunnycdn.com/speed-zone/scripts/15/scrachar_15.js",
  );
  assert.equal(seen.options.method, "PUT");
  assert.equal(seen.options.headers.AccessKey, "storage-pass");
  assert.equal(seen.options.body, "console.log(1)");
});

test("uploadFile surfaces HTTP failures and timeouts", async () => {
  const failed = await uploadFile({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    content: "x",
    fetchImpl: async () => makeResponse(500),
  });
  assert.equal(failed.success, false);
  assert.match(failed.message, /500/);

  const aborted = await uploadFile({
    config: CONFIG,
    remotePath: "scripts/15/scrachar_15.js",
    content: "x",
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  assert.equal(aborted.success, false);
  assert.equal(aborted.message, "timeout");
});

test("purgeCache needs a key and calls the purge endpoint", async () => {
  const noKey = await purgeCache({
    config: { ...CONFIG, purgeApiKey: "" },
    url: "https://speed.b-cdn.net/scripts/15/scrachar_15.js",
  });
  assert.equal(noKey.success, false);

  let seenUrl;
  const result = await purgeCache({
    config: CONFIG,
    url: "https://speed.b-cdn.net/scripts/15/scrachar_15.js",
    fetchImpl: async (url) => {
      seenUrl = url;
      return makeResponse(200);
    },
  });
  assert.equal(result.success, true);
  assert.ok(seenUrl.startsWith("https://api.bunny.net/purge"));
  assert.ok(seenUrl.includes(encodeURIComponent("https://speed.b-cdn.net/scripts/15/scrachar_15.js")));
});
