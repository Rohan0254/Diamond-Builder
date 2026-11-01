import test from "node:test";
import assert from "node:assert/strict";

import { SCRIPT_MARKERS } from "./scripts.js";
import {
  OVERALL_STATUS,
  STATUS_LABELS,
  VERIFY_STATUS,
  classifyScriptPlacement,
  computeOverallStatus,
  detectPasswordPage,
  isVerifiedStatus,
  overallStatusLabel,
  verifyScriptsAcrossSources,
  verifyScriptsInHtml,
} from "./verify.js";

const SAMPLE_SCRIPTS = [{ key: "storefront-optimization" }];

/** Two markers used only as a fixture to prove partial installs stay incomplete. */
const TWO_MARKERS = {
  "storefront-optimization": "data-speed-scratcher-optimization",
  "performance-tracking": "data-speed-scratcher-tracking",
};
const TWO_SCRIPTS = [
  { key: "storefront-optimization" },
  { key: "performance-tracking" },
];

test("detectPasswordPage recognizes Shopify password pages only", () => {
  const passwordPage = `<!doctype html><html><body>
    <form id="password_form" class="shopify-password-form" action="/password">
      <input type="password" name="password" />
    </form></body></html>`;
  assert.equal(detectPasswordPage(passwordPage), true);
  assert.equal(
    detectPasswordPage("<html><body><h1>Welcome</h1><p>content</p></body></html>"),
    false,
  );
  assert.equal(detectPasswordPage(""), false);
  assert.equal(detectPasswordPage(null), false);
});

test("successful verification: every marker present reports verified", () => {
  const html = [
    "<html><head>",
    `<script data-speed-scratcher-optimization defer></script>`,
    "</head></html>",
  ].join("\n");
  const results = verifyScriptsInHtml({ html, markers: SCRIPT_MARKERS, scripts: SAMPLE_SCRIPTS });
  assert.equal(results.length, 1);
  for (const result of results) {
    assert.equal(result.status, VERIFY_STATUS.VERIFIED, result.key);
    assert.ok(result.message.length > 0);
  }
  assert.equal(computeOverallStatus({ fetchOk: true, passwordPage: false, results }), OVERALL_STATUS.COMPLETE);
});

test("failed verification: the missing marker reports not-detected", () => {
  const html = "<html><body><p>no scripts here</p></body></html>";
  const results = verifyScriptsInHtml({ html, markers: SCRIPT_MARKERS, scripts: SAMPLE_SCRIPTS });
  assert.equal(results.length, 1);
  for (const result of results) {
    assert.equal(result.status, VERIFY_STATUS.NOT_DETECTED, result.key);
  }
  assert.equal(computeOverallStatus({ fetchOk: true, passwordPage: false, results }), OVERALL_STATUS.INCOMPLETE);
});

test("partial installs (one marker of two) produce incomplete, never complete", () => {
  const html =
    "<html><head><script data-speed-scratcher-optimization defer></script></head><body>nothing</body></html>";
  const results = verifyScriptsInHtml({ html, markers: TWO_MARKERS, scripts: TWO_SCRIPTS });
  assert.equal(results.length, 2);
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.equal(results[1].status, VERIFY_STATUS.NOT_DETECTED);
  assert.equal(computeOverallStatus({ fetchOk: true, passwordPage: false, results }), OVERALL_STATUS.INCOMPLETE);
  assert.ok(!isVerifiedStatus(results[1].status));
});

test("an unverifiable fetch or password page is unknown, not a false result", () => {
  const unknown = computeOverallStatus({ fetchOk: false, passwordPage: false, results: [] });
  assert.equal(unknown, OVERALL_STATUS.UNKNOWN);
  const password = computeOverallStatus({ fetchOk: true, passwordPage: true, results: [] });
  assert.equal(password, OVERALL_STATUS.UNKNOWN);
  // Even with markers present, a password page must not report complete.
  const allVerified = [
    { key: "a", status: VERIFY_STATUS.VERIFIED },
    { key: "b", status: VERIFY_STATUS.VERIFIED },
  ];
  assert.equal(
    computeOverallStatus({ fetchOk: true, passwordPage: true, results: allVerified }),
    OVERALL_STATUS.UNKNOWN,
  );
});

test("a missing marker configuration is reported as unable-to-verify", () => {
  const results = verifyScriptsInHtml({
    html: "<html></html>",
    markers: { "storefront-optimization": SCRIPT_MARKERS["storefront-optimization"] },
    scripts: [{ key: "unknown-script" }],
  });
  assert.equal(results[0].status, VERIFY_STATUS.UNABLE);
});

// ------------------------------------- per-shop CDN script (URL-aware checks)

const CDN_URL = "https://speed.example.test/scripts/abc/scrachar_abc.js";
const CDN_SCRIPTS = [{ key: "storefront-optimization", src: CDN_URL }];
const CDN_SNIPPET = `<script data-speed-scratcher-optimization data-user-id="abc" src="${CDN_URL}" defer></script>`;

test("the exact per-shop CDN script verifies when both marker and URL are present", () => {
  const results = verifyScriptsAcrossSources({
    scripts: CDN_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [
      { filename: "layout/theme.liquid", content: `<head>${CDN_SNIPPET}</head>` },
    ],
    html: "",
    storefrontChecked: false,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /layout\/theme\.liquid/);
});

test("the exact per-shop CDN script verifies from the storefront alone", () => {
  const results = verifyScriptsAcrossSources({
    scripts: CDN_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: false,
    themeFiles: [],
    html: `<html><head>${CDN_SNIPPET}</head></html>`,
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /storefront HTML/);
});

test("an older snippet (marker present, URL different) is reported as not verified", () => {
  const oldSnippet =
    '<script data-speed-scratcher-optimization src="https://old.example.test/scripts/abc/scrachar_abc.js" defer></script>';
  const results = verifyScriptsAcrossSources({
    scripts: CDN_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [
      { filename: "layout/theme.liquid", content: `<head>${oldSnippet}</head>` },
    ],
    html: `<html>${oldSnippet}</html>`,
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.NOT_DETECTED);
  assert.match(results[0].message, /older version/i);
});

test("without a URL on the definition, a marker match still verifies", () => {
  const results = verifyScriptsAcrossSources({
    scripts: [{ key: "storefront-optimization" }],
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [
      { filename: "layout/theme.liquid", content: "<head>anything</head>" },
    ],
    html: '<script data-speed-scratcher-optimization defer></script>',
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
});

test("status labels never claim success for a failure state", () => {
  assert.equal(STATUS_LABELS[VERIFY_STATUS.VERIFIED], "Verified");
  assert.equal(STATUS_LABELS[VERIFY_STATUS.MISPLACED], "Installed outside <head>");
  assert.equal(STATUS_LABELS[VERIFY_STATUS.NOT_DETECTED], "Not detected");
  assert.equal(STATUS_LABELS[VERIFY_STATUS.UNABLE], "Unable to verify automatically");
  assert.equal(overallStatusLabel(OVERALL_STATUS.COMPLETE), "Setup complete");
  assert.equal(overallStatusLabel(OVERALL_STATUS.INCOMPLETE), "Setup incomplete");
  assert.equal(overallStatusLabel(OVERALL_STATUS.UNKNOWN), "Verification pending");
  assert.equal(overallStatusLabel("bogus"), "Not configured");
});

// --------------------------------------------- theme + storefront verification

const THEME_MARKER_FILE = {
  filename: "layout/theme.liquid",
  content:
    '<head><script data-speed-scratcher-optimization defer></script></head>',
};

test("a marker in the live theme verifies even without reading the storefront", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [THEME_MARKER_FILE, { filename: "templates/index.json", content: "{}" }],
    html: "",
    storefrontChecked: false,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /layout\/theme\.liquid/);
  // A theme match completes setup even when the storefront was password-locked.
  assert.equal(
    computeOverallStatus({ fetchOk: true, passwordPage: false, results }),
    OVERALL_STATUS.COMPLETE,
  );
});

test("a marker found in the storefront HTML verifies when the theme cannot be read", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: false,
    themeFiles: [],
    html: THEME_MARKER_FILE.content,
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /storefront HTML/);
});

test("a marker absent from both readable sources is not-detected", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [{ filename: "layout/theme.liquid", content: "no marker here" }],
    html: "<html><body>no marker here</body></html>",
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.NOT_DETECTED);
  assert.equal(
    computeOverallStatus({ fetchOk: true, passwordPage: false, results }),
    OVERALL_STATUS.INCOMPLETE,
  );
});

test("neither source readable is unable-to-verify, never a false result", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: false,
    themeFiles: [],
    html: "",
    storefrontChecked: false,
    unableMessage: "theme not readable and storefront unreachable",
  });
  assert.equal(results[0].status, VERIFY_STATUS.UNABLE);
  assert.match(results[0].message, /unreachable/);
  assert.equal(
    computeOverallStatus({ fetchOk: false, passwordPage: false, results }),
    OVERALL_STATUS.UNKNOWN,
  );
});

test("a script with no marker configured stays unable regardless of sources", () => {
  const results = verifyScriptsAcrossSources({
    scripts: [{ key: "unknown-script" }],
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [THEME_MARKER_FILE],
    storefrontChecked: true,
    html: "<html></html>",
  });
  assert.equal(results[0].status, VERIFY_STATUS.UNABLE);
});

// ------------------------------------------------ placement (<head> vs body)

const IN_HEAD = `<html><head><script ${SCRIPT_MARKERS["storefront-optimization"]} src="https://cdn.test/a.js"></script></head><body>hi</body></html>`;
const IN_BODY =
  '<html><head><title>t</title></head><body><script data-speed-scratcher-optimization src="https://cdn.test/a.js"></script></body></html>';

test("classifyScriptPlacement distinguishes head, body and unknown", () => {
  assert.equal(classifyScriptPlacement(IN_HEAD, SCRIPT_MARKERS["storefront-optimization"]), "head");
  assert.equal(classifyScriptPlacement(IN_BODY, SCRIPT_MARKERS["storefront-optimization"]), "body");
  assert.equal(
    classifyScriptPlacement("<div>no head structure</head></div>", SCRIPT_MARKERS["storefront-optimization"]),
    "unknown",
  );
  assert.equal(classifyScriptPlacement("", SCRIPT_MARKERS["storefront-optimization"]), "unknown");
  assert.equal(classifyScriptPlacement(null, "x"), "unknown");
  // A marker in a snippet with no head/body structure cannot be judged.
  assert.equal(
    classifyScriptPlacement(
      '<script data-speed-scratcher-optimization defer></script>',
      SCRIPT_MARKERS["storefront-optimization"],
    ),
    "unknown",
  );
});

test("a script inside <head> verifies", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [
      { filename: "layout/theme.liquid", content: THEME_MARKER_FILE.content },
    ],
    html: "",
    storefrontChecked: false,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /inside <head>/);
});

test("a script pasted in the body is reported as misplaced, never verified", () => {
  const themeFile = {
    filename: "layout/theme.liquid",
    content: `<html><head></head><body>\n<script data-speed-scratcher-optimization defer></script>\n</body></html>`,
  };
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [themeFile],
    html: "",
    storefrontChecked: false,
  });
  assert.equal(results[0].status, VERIFY_STATUS.MISPLACED);
  assert.match(results[0].message, /outside <head>/);
  assert.notEqual(
    computeOverallStatus({ fetchOk: true, passwordPage: false, results }),
    OVERALL_STATUS.COMPLETE,
  );
});

test("the live storefront placement wins over the theme file", () => {
  const themeInHead = {
    filename: "layout/theme.liquid",
    content: `<html><head><script data-speed-scratcher-optimization defer></script></head><body></body></html>`,
  };
  // The rendered storefront has it in the body (e.g. the theme file is not the
  // published one, or the tag is moved by Liquid) — that must be reported.
  const html = `<html><head></head><body><script data-speed-scratcher-optimization defer></script></body></html>`;
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [themeInHead],
    html,
    storefrontChecked: true,
  });
  assert.equal(results[0].status, VERIFY_STATUS.MISPLACED);
});

test("placement that cannot be judged still verifies, with a note", () => {
  const results = verifyScriptsAcrossSources({
    scripts: SAMPLE_SCRIPTS,
    markers: SCRIPT_MARKERS,
    themeAvailable: true,
    themeFiles: [
      { filename: "snippets/speed.liquid", content: "<script data-speed-scratcher-optimization defer></script>" },
    ],
    html: "",
    storefrontChecked: false,
  });
  assert.equal(results[0].status, VERIFY_STATUS.VERIFIED);
  assert.match(results[0].message, /could not be confirmed/);
});