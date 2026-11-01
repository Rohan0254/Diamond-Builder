import test from "node:test";
import assert from "node:assert/strict";

import {
  SCRIPT_KEYS,
  SCRIPT_MARKERS,
  SCRIPT_META,
  buildScriptDefinition,
  buildScriptDefinitions,
  extractScriptSrc,
  getPublicScripts,
  getScriptMeta,
  isScriptKey,
} from "./scripts.js";

const PLACEHOLDER = "PLACEHOLDER";

test("exactly one script is configured with a stable key and step", () => {
  assert.deepEqual(SCRIPT_KEYS, ["storefront-optimization"]);
  assert.deepEqual(
    SCRIPT_KEYS.map((key) => SCRIPT_META[key].step),
    [1],
  );
  assert.equal(getScriptMeta("enterprise"), null);
  assert.ok(isScriptKey("storefront-optimization"));
  // Removed scripts are no longer valid keys.
  assert.ok(!isScriptKey("performance-tracking"));
  assert.ok(!isScriptKey("optimization-config"));
  assert.ok(!isScriptKey("nope"));
});

test("the script definition carries a copy label, install hint and marker", () => {
  for (const key of SCRIPT_KEYS) {
    const meta = SCRIPT_META[key];
    assert.ok(meta.title.length > 0, `${key} needs a title`);
    assert.ok(meta.description.length > 0, `${key} needs a description`);
    assert.ok(meta.copyLabel.startsWith("Copy "), `${key} copy label`);
    assert.ok(meta.installHint.includes("theme.liquid"), `${key} install hint`);
    assert.ok(
      typeof SCRIPT_MARKERS[key] === "string" && SCRIPT_MARKERS[key].length > 0,
      `${key} needs a marker`,
    );
  }
});

test("the unconfigured script is a clearly marked placeholder with its marker", () => {
  const scripts = buildScriptDefinitions({ optimizationUrl: "" });
  assert.equal(scripts.length, 1);
  const script = scripts[0];
  assert.ok(script.script.includes(SCRIPT_MARKERS[script.key]), script.key);
  // Must carry an obvious placeholder marker and no invented endpoint host.
  assert.ok(script.script.includes(PLACEHOLDER));
  assert.ok(!script.script.includes("https://"), "no invented URL");
});

test("the configured script uses the server-provided URL and drops the placeholder note", () => {
  const scripts = buildScriptDefinitions({
    optimizationUrl: "https://cdn.example.test/opt.js",
  });
  const script = scripts[0];
  assert.ok(script.script.includes('src="https://cdn.example.test/opt.js"'));
  assert.ok(!script.script.includes(PLACEHOLDER));
});

test("the copyable script does not embed the install instruction comment", () => {
  const configured = buildScriptDefinitions({
    optimizationUrl: "https://cdn.example.test/opt.js",
  })[0].script;
  assert.ok(!configured.includes("<!-- Install"));
  assert.ok(!configured.includes("theme.liquid"));
});

test("getPublicScripts returns the raw copyable text without UI labels or errors", () => {
  const publicScripts = getPublicScripts();
  assert.equal(publicScripts.length, 1);
  for (const script of publicScripts) {
    // The payload the copy button writes must be exactly `script` and must not
    // include any UI chrome (labels, buttons, banners) or error strings.
    assert.equal(typeof script.script, "string");
    assert.ok(!script.script.includes("Script copied to clipboard"));
    assert.ok(!script.script.includes("Copy failed"));
    assert.ok(!/<button/i.test(script.script));
  }
  // The very same raw text is what the marker detection looks for a subset of.
  assert.ok(
    publicScripts[0].script.includes(SCRIPT_MARKERS["storefront-optimization"]),
  );
});

test("extractScriptSrc reads the src URL from a rendered script block", () => {
  const script = buildScriptDefinitions({ optimizationUrl: "https://example.test/script.js" })[0].script;
  assert.equal(
    extractScriptSrc(script),
    "https://example.test/script.js",
  );
  // The unconfigured placeholder has no src.
  const placeholder = buildScriptDefinitions({ optimizationUrl: "" })[0].script;
  assert.equal(extractScriptSrc(placeholder), "");
  assert.equal(extractScriptSrc(""), "");
  assert.equal(extractScriptSrc(null), "");
});

test("buildScriptDefinition wraps arbitrary copyable text with the script metadata", () => {
  const definition = buildScriptDefinition({ script: "<script></script>" });
  assert.equal(definition.key, "storefront-optimization");
  assert.equal(definition.step, 1);
  assert.equal(definition.script, "<script></script>");
  assert.ok(definition.installHint.includes("theme.liquid"));
});