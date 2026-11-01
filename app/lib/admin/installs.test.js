import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInstallStatusFilter,
  normalizeSearch,
  parseDayValue,
  buildDateRange,
  readFilters,
  buildInstallationWhere,
  buildShopEventWhere,
  eventTypeForInstall,
} from "./installs.js";

describe("installs: filters", () => {
  test("normalizes status", () => {
    assert.equal(normalizeInstallStatusFilter("installed"), "installed");
    assert.equal(normalizeInstallStatusFilter("UNINSTALLED"), "uninstalled");
    assert.equal(normalizeInstallStatusFilter("all"), "all");
    assert.equal(normalizeInstallStatusFilter("x"), "all");
  });

  test("parses day range", () => {
    const gte = parseDayValue("2026-01-01");
    const lte = parseDayValue("2026-01-31", { endOfDay: true });
    assert.equal(gte.getUTCFullYear(), 2026);
    assert.equal(lte.getUTCHours(), 23);
    const bad = parseDayValue("2026-02-30");
    assert.equal(bad, null);
  });

  test("reads filters from URLSearchParams", () => {
    const p = new URLSearchParams({ status: "installed", q: " shop.myshopify.com ", from: "2026-01-01", to: "2026-01-31" });
    const f = readFilters(p);
    assert.equal(f.status, "installed");
    assert.equal(f.search, "shop.myshopify.com");
  });

  test("builds where clauses", () => {
    const w = buildInstallationWhere({ status: "installed", search: "alpha" });
    assert.equal(w.status, "INSTALLED");
    assert.ok(Array.isArray(w.OR));
    const ew = buildShopEventWhere({ status: "uninstalled", search: "alpha" });
    assert.equal(ew.type, "UNINSTALLED");
    const ew2 = buildShopEventWhere({ status: "installed" });
    assert.deepEqual(ew2.type, { in: ["INSTALLED", "REINSTALLED"] });
  });

  test("event type for install", () => {
    assert.equal(eventTypeForInstall("uninstalled"), "REINSTALLED");
    assert.equal(eventTypeForInstall(null), "INSTALLED");
  });
});
