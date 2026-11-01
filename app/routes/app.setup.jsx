import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdminOrDiagnose } from "../shopify.server";
import {
  canVerifyNow,
  getScriptDefinitions,
  getLatestSetupVerification,
  runSetupVerification,
  serializeSetupVerification,
} from "../setup.server";
import { overallStatusLabel } from "../lib/verify";
/* eslint-disable react/prop-types -- plain JS internal components, not a public API */

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
    // Fallback for non-secure contexts and older browsers.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied
      ? { ok: true }
      : { ok: false, error: "The browser blocked the copy." };
  } catch (error) {
    return { ok: false, error: error?.message ?? "Could not copy." };
  }
}

function ScriptCard({ script, notify }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(null);
  const resetTimer = useRef(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    setCopyError(null);
    const result = await copyTextToClipboard(script.script);
    if (result.ok) {
      setCopied(true);
      notify("Script copied to clipboard.");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyError(
        "Could not copy automatically. Select the code and copy it manually.",
      );
      notify("Could not copy the script automatically.", { isError: true });
    }
  };

  return (
    <div className="ss-script-card">
      <div className="ss-script-card__header">
        <s-badge>{`Step ${script.step}`}</s-badge>
        <s-stack direction="block" gap="small">
          <s-heading>{script.title}</s-heading>
          <s-text color="subdued">{script.description}</s-text>
          <s-text color="subdued">Install: {script.installHint}</s-text>
        </s-stack>
      </div>

      <div className="ss-code">
        <s-button
          type="button"
          variant="tertiary"
          icon={copied ? "check" : "clipboard"}
          accessibilityLabel={script.copyLabel}
          onClick={handleCopy}
          className="ss-code__copy"
        />
        <pre className="ss-code__pre">{script.script}</pre>
      </div>

      {copied && (
        <s-text tone="success" fontWeight="semibold">
          Copied to clipboard
        </s-text>
      )}
      {copyError && (
        <s-banner tone="critical" heading="Copy failed">
          {copyError}
        </s-banner>
      )}
    </div>
  );
}

const RESULT_ICON = {
  verified: { icon: "check-circle", tone: "success", label: "Verified" },
  misplaced: {
    icon: "alert-triangle",
    tone: "warning",
    label: "Installed outside <head>",
  },
  "not-detected": { icon: "x-circle", tone: "critical", label: "Not detected" },
  "unable-to-verify": {
    icon: "question-circle",
    tone: "warning",
    label: "Unable to verify automatically",
  },
};

function VerificationResults({ verification, sources, onRetry, isRunning }) {
  if (!verification) return null;
  const status = verification.overallStatus;
  const results = verification.scripts ?? [];
  const misplaced = results.filter((result) => result.status === "misplaced");

  return (
    <s-stack direction="block" gap="base">
      {status === "incomplete" && (
        <s-banner tone="warning" heading="Setup incomplete">
          <s-stack direction="block" gap="base">
            <s-text>
              {misplaced.length > 0
                ? "Your script is installed but not inside <head>. Move it just before </head> in theme.liquid, save the theme, then verify again."
                : "The script could not be verified. Please review the instructions and try again."}
            </s-text>
            <s-stack direction="inline">
              <s-button onClick={onRetry} disabled={isRunning} loading={isRunning}>
                Retry Verification
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}
      {status === "unknown" && (
        <s-banner tone="info" heading="Verification pending">
          <s-stack direction="block" gap="base">
            <s-text>
              The script could not be verified automatically. Grant the app the
              read_themes permission (re-install or re-open the app), or make a
              password-protected storefront public, then verify again.
            </s-text>
            <s-stack direction="inline">
              <s-button onClick={onRetry} disabled={isRunning} loading={isRunning}>
                Retry Verification
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      <s-section heading="Verification results">
        <s-stack direction="block" gap="small">
          {results.map((result) => {
            const meta = RESULT_ICON[result.status] ?? RESULT_ICON["unable-to-verify"];
            return (
              <div className="ss-result" key={result.key}>
                <s-icon type={meta.icon} tone={meta.tone} />
                <div className="ss-result__body">
                  <s-text fontWeight="semibold">
                    {result.label ?? meta.label} —{" "}
                    {result.key.replace(/-/g, " ")}
                  </s-text>
                  <s-text color="subdued">{result.message}</s-text>
                </div>
              </div>
            );
          })}
          {sources ? (
            <s-text color="subdued">
              {sources.themeRead
                ? `Checked the live theme${sources.themeName ? ` "${sources.themeName}"` : ""}.`
                : `The live theme could not be read (reason: ${sources.themeReason}); checked the public storefront${
                    sources.storefrontChecked ? ` (HTTP ${sources.storefrontStatus})` : ""
                  }.`}
            </s-text>
          ) : null}
          {verification.verifiedAt ? (
            <s-text color="subdued">
              Last verified: {new Date(verification.verifiedAt).toLocaleString()}
            </s-text>
          ) : null}
        </s-stack>
      </s-section>
    </s-stack>
  );
}

export const loader = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "setup.loader");
  if (!auth.ok) {
    return {
      scripts: [],
      setup: null,
      authError: auth.error,
    };
  }

  const { session } = auth.context;

  let setup = null;
  try {
    const record = await getLatestSetupVerification(session.shop);
    setup = serializeSetupVerification(record);
  } catch (error) {
    console.error("Failed to load latest setup verification", error);
  }

  return {
    scripts: getScriptDefinitions(),
    setup,
    authError: null,
  };
};

export const action = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "setup.action");
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }
  const { session } = auth.context;

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent !== "verify") {
    return { ok: false, error: "Unsupported action." };
  }

  const gate = canVerifyNow(session.shop);
  if (!gate.allowed) {
    return {
      ok: false,
      error: `Please wait ${gate.retryAfterSeconds}s before verifying again.`,
    };
  }

  let result;
  try {
    result = await runSetupVerification(session.shop, {
      admin: auth.context.admin,
    });
  } catch (error) {
    console.error("[setup.action] verification failed", error);
    return {
      ok: false,
      error: "Verification could not be completed. Please try again in a moment.",
    };
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, setup: result.setup, sources: result.sources };
};

function statusBadge(overallStatus) {
  switch (overallStatus) {
    case "complete":
      return { label: overallStatusLabel(overallStatus), tone: "success" };
    case "incomplete":
      return { label: overallStatusLabel(overallStatus), tone: "critical" };
    case "unknown":
      return { label: overallStatusLabel(overallStatus), tone: "info" };
    default:
      return { label: "Not configured", tone: "critical" };
  }
}

export default function SetupPage() {
  const {
    scripts,
    setup,
    authError,
  } = useLoaderData();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const isRunning = fetcher.state !== "idle";
  const isNavigating = navigation.state !== "idle";
  const verification = fetcher.data?.setup ?? setup;
  const badge = statusBadge(verification?.overallStatus);
  const isVerified = verification?.overallStatus === "complete";

  useEffect(() => {
    shopify.loading(isRunning || isNavigating);
  }, [shopify, isRunning, isNavigating]);

  useEffect(() => {
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const notify = (message, options) => shopify.toast.show(message, options);
  const runVerify = () => fetcher.submit({ intent: "verify" }, { method: "POST" });

  return (
    <s-page heading="Setup" inlinesize="base">
      <style>{`
        .ss-script-card {
          background: #ffffff;
          border: 1px solid var(--p-color-border-subdued, #e1e3e5);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ss-script-card__header {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ss-code {
          position: relative;
          border-radius: 10px;
          background: #f6f6f7;
          border: 1px solid var(--p-color-border-subdued, #e1e3e5);
        }
        .ss-code s-button {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 1;
          background: #ffffff;
          border-radius: 8px;
        }
        .ss-code__pre {
          margin: 0;
          padding: 16px;
          padding-top: 18px;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
            "Liberation Mono", monospace;
          font-size: 12.5px;
          line-height: 1.6;
          color: #202223;
          white-space: pre;
          overflow-x: auto;
          max-width: 100%;
        }
        .ss-result {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .ss-result__body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
      `}</style>

      <s-stack direction="block" gap="base">
        {isVerified && (
          <s-banner tone="success" heading="Setup completed successfully!">
            <s-text>Diamond Builder is configured for your store.</s-text>
          </s-banner>
        )}


        <s-stack direction="block" gap="small">
          <s-text color="subdued">
            Copy the script below, paste it into your theme&apos;s theme.liquid
            file, then verify your setup.
          </s-text>
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone={badge.tone}>{badge.label}</s-badge>
          </s-stack>
        </s-stack>

        {authError && (
          <s-banner tone="critical" heading="Could not authenticate with Shopify">
            {authError}
          </s-banner>
        )}

        <s-stack direction="block" gap="base">
          {scripts.map((script) => (
            <ScriptCard key={script.key} script={script} notify={notify} />
          ))}
        </s-stack>

        <s-stack direction="block" gap="base">
          <s-stack
            direction="inline"
            gap="small"
            alignItems="center"
            justifyContent="flex-end"
          >
            <s-button
              variant="primary"
              loading={isRunning}
              disabled={isRunning}
              onClick={runVerify}
            >
              {isRunning ? "Verifying…" : "Verify Setup"}
            </s-button>
            <s-button
              variant="secondary"
              disabled={!isVerified || isNavigating}
              loading={isNavigating}
              onClick={() => navigate("/app")}
            >
              {isNavigating ? "Loading…" : "Go to Dashboard"}
            </s-button>
          </s-stack>
          <s-text color="subdued">
            {isVerified
                ? "You can come back to this Setup page anytime from the menu."
                : "Verify your setup to unlock the dashboard."}
          </s-text>
          <s-text color="subdued">
            Verification reads your live theme, then checks the public storefront
            for the script&apos;s marker. It does not charge anything or change
            your theme.
          </s-text>
        </s-stack>

        <VerificationResults
          verification={verification}
          sources={fetcher.data?.sources}
          onRetry={runVerify}
          isRunning={isRunning}
        />
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};