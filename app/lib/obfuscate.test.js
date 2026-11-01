import test from "node:test";
import assert from "node:assert/strict";

import { OBFUSCATOR_OPTIONS, obfuscateScript } from "./obfuscate.js";

test("obfuscateScript leaves non-string and empty input untouched", async () => {
  assert.equal(await obfuscateScript(""), "");
  assert.equal(await obfuscateScript(null), null);
  assert.equal(await obfuscateScript("   "), "   ");
});

test("obfuscateScript skips obfuscation when disabled", async () => {
  const code = "function hi(){return 1;}";
  assert.equal(await obfuscateScript(code, { enabled: false }), code);
});

test("obfuscateScript obfuscates a real script with the configured options", async () => {
  const code = 'function greet(){var message="hello world";return message;}';
  const output = await obfuscateScript(code);
  assert.equal(typeof output, "string");
  assert.ok(output.length > 0);
  assert.notEqual(output, code);
  // The whole point: the original literal is no longer trivially readable.
  assert.ok(!output.includes("hello world"));
  assert.equal(OBFUSCATOR_OPTIONS.target, "browser");
});
