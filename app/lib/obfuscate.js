// JavaScript obfuscation for the generated storefront script.
//
// `javascript-obfuscator` is a CommonJS package, so it is loaded lazily through
// a dynamic `import()` (the ESM interop puts the module on `.default`). Nothing
// here throws: any failure (missing package, unsupported syntax) returns the
// original source so the generated script still loads.
//
// The option set is deliberately moderate. Control-flow flattening, dead-code
// injection and self-defending produce much larger, much slower output, and this
// runs inside a page load the first time a shop generates its script.

/** Options passed to `javascript-obfuscator`. */
export const OBFUSCATOR_OPTIONS = {
  compact: true,
  simplify: true,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  splitStrings: true,
  splitStringsChunkLength: 10,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  disableConsoleOutput: false,
  target: "browser",
};

/**
 * Obfuscates `code`. Returns the input unchanged when `enabled` is false, the
 * input is empty, or obfuscation fails.
 */
export async function obfuscateScript(code, { enabled = true } = {}) {
  if (!enabled || typeof code !== "string" || !code.trim()) return code;
  try {
    const module = await import("javascript-obfuscator");
    // ESM interop: the default export is the CommonJS `module.exports`.
    const obfuscator = module?.default ?? module;
    if (typeof obfuscator?.obfuscate !== "function") return code;
    const result = obfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
    const output = result?.getObfuscatedCode?.();
    return typeof output === "string" && output.length ? output : code;
  } catch (error) {
    console.error(
      "[obfuscate] obfuscation failed; using the plain script",
      error,
    );
    return code;
  }
}
