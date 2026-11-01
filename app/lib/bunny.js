/* eslint-env node */
/* global globalThis */
// BunnyCDN Storage client (server-side only).
//
// This is the JS port of the legacy PHP `BunnyCDNStorage` class: it uploads the
// per-shop script to `scripts/{userId}/scrachar_{userId}.js`, reads file info
// with a ranged GET (Bunny's Storage API does not support HEAD), and purges the
// Pull Zone cache after an upload.
//
// Everything runs through the global `fetch`, so it needs no SDK dependency,
// and nothing here throws - every call returns a result object with `success`.
// The network implementation is injectable (`fetchImpl`) so the behaviour is
// unit-testable without touching Bunny.

export const BUNNY_DEFAULT_STORAGE_HOSTNAME = "storage.bunnycdn.com";
export const BUNNY_PURGE_ENDPOINT = "https://api.bunny.net/purge";
export const BUNNY_REQUEST_TIMEOUT_MS = 15000;
export const BUNNY_UPLOAD_TIMEOUT_MS = 30000;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stripLeadingSlash(path) {
  return String(path ?? "").replace(/^\/+/, "");
}

/** Reads the Bunny configuration from the environment. */
export function readBunnyConfig(env = process.env) {
  const apiKey = text(env?.BUNNY_API_KEY);
  return {
    apiKey,
    storageZone: text(env?.BUNNY_STORAGE_ZONE),
    storageHostname:
      text(env?.BUNNY_STORAGE_HOSTNAME) || BUNNY_DEFAULT_STORAGE_HOSTNAME,
    cdnUrl: text(env?.BUNNY_CDN_URL).replace(/\/+$/, ""),
    username: text(env?.BUNNY_STORAGE_USERNAME),
    // The storage password is the AccessKey for storage operations.
    storagePassword: text(env?.BUNNY_STORAGE_PASSWORD),
    // The Pull Zone key purges the CDN cache; it falls back to the main key.
    purgeApiKey: text(env?.BUNNY_PULLZONE_API_KEY) || apiKey,
    // Obfuscation is on unless explicitly disabled.
    obfuscate: text(env?.BUNNY_SCRIPT_OBFUSCATE).toLowerCase() !== "false",
  };
}

/** True when the settings needed to upload and serve a script are present. */
export function isBunnyConfigured(config) {
  return Boolean(
    config?.storageZone && config?.storagePassword && config?.cdnUrl,
  );
}

/** Per-user script filename: `scrachar_{userId}.js`. */
export function getScriptFilename(userId) {
  return `scrachar_${userId}.js`;
}

/** Per-user script path: `scripts/{userId}/scrachar_{userId}.js`. */
export function getUserScriptPath(userId) {
  return `scripts/${userId}/${getScriptFilename(userId)}`;
}

/** Per-user CDN URL: `https://speed.b-cdn.net/scripts/15/scrachar_15.js`. */
export function getUserCdnUrl(config, userId) {
  const base = String(config?.cdnUrl ?? "").replace(/\/+$/, "");
  return `${base}/${getUserScriptPath(userId)}`;
}

function storageUrl(config, remotePath) {
  return `https://${config.storageHostname}/${config.storageZone}/${stripLeadingSlash(remotePath)}`;
}

/** Reads file info from the storage zone with a 1-byte ranged GET. */
export async function getFileInfo({
  config,
  remotePath,
  fetchImpl,
  timeoutMs = BUNNY_REQUEST_TIMEOUT_MS,
} = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { success: false, exists: false, status: 0, message: "fetch is not available" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(storageUrl(config, remotePath), {
      method: "GET",
      // Bunny's Storage API does not support HEAD; a ranged GET returns 206 with
      // the total size in Content-Range.
      headers: { AccessKey: config.storagePassword, Range: "bytes=0-0" },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return { success: true, exists: false, status: 404 };
    }
    if (response.status === 401) {
      return {
        success: false,
        exists: false,
        status: 401,
        message: "Auth failed (401) - check BUNNY_STORAGE_PASSWORD",
      };
    }
    if (response.status === 403) {
      return { success: false, exists: false, status: 403, message: "Access denied (403)" };
    }
    if (response.ok || response.status === 206) {
      let size = null;
      const range = response.headers?.get?.("content-range");
      if (range) {
        const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(range);
        if (match) size = Number(match[1]);
      }
      if (size === null) {
        const length = response.headers?.get?.("content-length");
        if (length) size = Number(length);
      }
      return { success: true, exists: true, status: response.status, size };
    }
    return {
      success: false,
      exists: false,
      status: response.status,
      message: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      exists: false,
      status: 0,
      message: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Uploads (PUT) a file to the storage zone. */
export async function uploadFile({
  config,
  remotePath,
  content,
  contentType = "application/javascript",
  fetchImpl,
  timeoutMs = BUNNY_UPLOAD_TIMEOUT_MS,
} = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { success: false, status: 0, message: "fetch is not available" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(storageUrl(config, remotePath), {
      method: "PUT",
      headers: { AccessKey: config.storagePassword, "Content-Type": contentType },
      body: content,
      signal: controller.signal,
    });
    if (response.ok || (response.status >= 200 && response.status < 300)) {
      return { success: true, status: response.status };
    }
    return {
      success: false,
      status: response.status,
      message: `Upload failed (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Purges a single file from the Pull Zone cache. */
export async function purgeCache({
  config,
  url,
  fetchImpl,
  timeoutMs = BUNNY_UPLOAD_TIMEOUT_MS,
} = {}) {
  if (!config?.purgeApiKey) {
    return { success: false, status: 0, message: "No purge API key configured" };
  }
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { success: false, status: 0, message: "fetch is not available" };
  }
  const endpoint = `${BUNNY_PURGE_ENDPOINT}?url=${encodeURIComponent(url)}&async=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(endpoint, {
      method: "POST",
      headers: { AccessKey: config.purgeApiKey },
      signal: controller.signal,
    });
    return response.ok
      ? { success: true, status: response.status, message: "Cache purged" }
      : {
          success: false,
          status: response.status,
          message: `Purge failed (HTTP ${response.status})`,
        };
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}
