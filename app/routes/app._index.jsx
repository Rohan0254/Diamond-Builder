import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdminOrDiagnose } from "../shopify.server";
import {
  checkThemeEmbedStatus,
  fetchAllShopifyCollections,
  getStorefrontBaseUrl,
  refreshStoreSettingFromShopify,
  syncStoreSettingMetafield,
  upsertStoreSetting,
} from "../data/store-setting.js";
import {
  DEFAULT_ENABLED_CATEGORIES,
  STOREFRONT_CATEGORY_OPTIONS,
  normalizeEnabledCategories,
} from "../lib/storefront-categories.js";
import { getDiamondSummaryCounts } from "../data/diamonds.js";
import { BUILDER_PAGE_DEFS, ensureBuilderPages } from "../data/shopify-pages.js";

const CATEGORY_OPTIONS = STOREFRONT_CATEGORY_OPTIONS;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildLivePageLinks(setting, storefrontBaseUrl) {
  const stored = setting?.pages || {};
  return BUILDER_PAGE_DEFS.map((def) => {
    const path = stored[def.key]?.url || "";
    const liveUrl =
      path && storefrontBaseUrl ? `${storefrontBaseUrl}${path}` : path;
    return {
      key: def.key,
      liveUrl,
    };
  });
}

function parseEnabledCategoriesForm(raw) {
  if (!raw) return { ...DEFAULT_ENABLED_CATEGORIES };
  try {
    return normalizeEnabledCategories(JSON.parse(String(raw)));
  } catch {
    return { ...DEFAULT_ENABLED_CATEGORIES };
  }
}

export const loader = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "dashboard.loader");
  if (!auth.ok) {
    return json({
      authError: auth.error,
      shop: null,
      storefrontBaseUrl: "",
      setting: null,
      collections: [],
      embedStatus: { checked: false, enabled: false, themeName: "" },
      counts: { natural: 0, lab: 0, gemstones: 0, colored: 0, all: 0 },
      pages: buildLivePageLinks(null, ""),
    });
  }

  const { admin, session } = auth.context;
  const [setting, collections, embedStatus, counts, storefrontBaseUrl] =
    await Promise.all([
      refreshStoreSettingFromShopify(admin, session.shop),
      fetchAllShopifyCollections(admin),
      checkThemeEmbedStatus(admin),
      getDiamondSummaryCounts(),
      getStorefrontBaseUrl(session.shop),
    ]);

  return json({
    authError: null,
    shop: session.shop,
    storefrontBaseUrl,
    setting,
    collections,
    embedStatus,
    counts,
    pages: buildLivePageLinks(setting, storefrontBaseUrl),
  });
};

export const action = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "dashboard.action");
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, 401);
  }

  const { admin, session } = auth.context;
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");
  const storefrontBaseUrl = await getStorefrontBaseUrl(session.shop);

  if (intent === "check_embed") {
    const embedStatus = await checkThemeEmbedStatus(admin);
    return json({
      ok: true,
      intent,
      embedStatus,
      message: embedStatus.enabled
        ? `Diamond Ring Builder app embed is active on ${embedStatus.themeName || "your live theme"}.`
        : "Diamond Ring Builder app embed is not enabled on your live theme yet.",
    });
  }

  if (intent === "repair_pages") {
    const result = await ensureBuilderPages({
      admin,
      shop: session.shop,
      repair: true,
    });
    if (result.errors.length) {
      return json({ ok: false, error: result.errors.join("; ") }, 502);
    }
    const updated = await refreshStoreSettingFromShopify(admin, session.shop);
    const totalChanged = result.created.length + result.updated.length;
    return json({
      ok: true,
      intent,
      message:
        totalChanged > 0
          ? "Storefront builder pages synced and updated."
          : "All storefront builder pages are live and up to date.",
      setting: updated,
      pages: buildLivePageLinks(updated, storefrontBaseUrl),
    });
  }

  const selectedId = String(form.get("ringCollectionId") || "").trim();
  const builderEnabled = form.get("builderEnabled") === "true";
  const enabledCategories = parseEnabledCategoriesForm(form.get("enabledCategories"));

  const collections = await fetchAllShopifyCollections(admin);
  const chosen = selectedId
    ? collections.find((c) => c.id === selectedId)
    : null;

  if (selectedId && !chosen) {
    return json(
      { ok: false, error: "Selected collection was not found in your store." },
      400,
    );
  }

  const saved = await upsertStoreSetting({
    shop: session.shop,
    ringCollection: chosen,
    builderEnabled,
    enabledCategories,
  });

  const metafieldSync = await syncStoreSettingMetafield(admin, saved);
  if (!metafieldSync.ok) {
    return json({
      ok: true,
      intent,
      warning: `Settings saved, but storefront sync returned: ${metafieldSync.error}`,
      setting: saved,
      pages: buildLivePageLinks(saved, storefrontBaseUrl),
    });
  }

  return json({
    ok: true,
    intent,
    message: chosen
      ? `Saved "${chosen.title}" and storefront visibility settings.`
      : "Storefront builder settings saved.",
    setting: saved,
    pages: buildLivePageLinks(saved, storefrontBaseUrl),
  });
};

export default function Dashboard() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const location = useLocation();
  const shopify = useAppBridge();

  const step1Ref = useRef(null);
  const step2Ref = useRef(null);

  const setting = fetcher.data?.setting ?? loaderData.setting;
  const pages = fetcher.data?.pages ?? loaderData.pages;
  const embedStatus = fetcher.data?.embedStatus ?? loaderData.embedStatus;
  const { authError, shop, storefrontBaseUrl, collections, counts } = loaderData;

  const [selectedId, setSelectedId] = useState(setting?.ringCollectionId || "");
  const [builderEnabled, setBuilderEnabled] = useState(
    setting?.builderEnabled ?? true,
  );
  const [enabledCategories, setEnabledCategories] = useState(() =>
    normalizeEnabledCategories(setting?.enabledCategories),
  );
  const [sidekickNotice, setSidekickNotice] = useState("");

  useEffect(() => {
    if (setting) {
      setSelectedId(setting.ringCollectionId || "");
      setBuilderEnabled(Boolean(setting.builderEnabled));
      setEnabledCategories(normalizeEnabledCategories(setting.enabledCategories));
    }
  }, [setting]);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok && fetcher.data.message) {
      shopify?.toast?.show?.(fetcher.data.message);
    } else if (fetcher.data.error) {
      shopify?.toast?.show?.(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Keep latest form & collection values accessible inside Sidekick tool callbacks
  const latestRef = useRef({
    selectedId,
    builderEnabled,
    enabledCategories,
    collections,
    fetcher,
  });
  latestRef.current = {
    selectedId,
    builderEnabled,
    enabledCategories,
    collections,
    fetcher,
  };

  // Support direct navigation from Sidekick intents (?step=embed or ?step=collection)
  useEffect(() => {
    const step = new URLSearchParams(location.search).get("step");
    if (step === "embed" && step1Ref.current) {
      step1Ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (step === "collection" && step2Ref.current) {
      step2Ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.search]);

  // Listen for Shopify App Bridge Intents & register interactive Sidekick tools immediately
  useEffect(() => {
    const cleanups = [];

    if (typeof shopify?.intents?.register === "function") {
      cleanups.push(
        shopify.intents.register((intent) => {
          const step = String(intent?.value?.step || intent?.action || "").toLowerCase();
          if (step.includes("embed")) {
            step1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }),
      );
    }

    if (typeof shopify?.tools?.register === "function") {
      cleanups.push(
        shopify.tools.register("get_builder_ui_state", () => {
          const cur = latestRef.current;
          const activeCol = cur.collections.find((c) => c.id === cur.selectedId);
          return {
            ok: true,
            ringCollectionTitle: activeCol?.title || null,
            builderEnabled: cur.builderEnabled,
            visibleCategories: cur.enabledCategories,
            availableCollections: cur.collections.map((c) => ({
              title: c.title,
              productsCount: c.productsCount,
            })),
          };
        }),
      );

      cleanups.push(
        shopify.tools.register("configure_builder_settings", (input = {}) => {
          const cur = latestRef.current;
          let nextId = cur.selectedId;
          let nextBuilderEnabled = cur.builderEnabled;
          const catInput =
            input.categories && typeof input.categories === "object"
              ? input.categories
              : input;

          const nextCategories = { ...cur.enabledCategories };
          const changedLabels = [];

          for (const opt of CATEGORY_OPTIONS) {
            if (typeof catInput[opt.key] === "boolean") {
              nextCategories[opt.key] = catInput[opt.key];
              changedLabels.push(
                `${opt.label}: ${catInput[opt.key] ? "Visible" : "Hidden"}`,
              );
            }
          }

          if (typeof input.builderEnabled === "boolean") {
            nextBuilderEnabled = input.builderEnabled;
            changedLabels.push(
              `Storefront Builder: ${input.builderEnabled ? "Enabled" : "Paused"}`,
            );
          }

          if (typeof input.ringCollectionTitle === "string" && input.ringCollectionTitle.trim()) {
            const needle = input.ringCollectionTitle.trim().toLowerCase();
            const matched =
              cur.collections.find((c) => c.title.toLowerCase() === needle) ||
              cur.collections.find((c) => c.title.toLowerCase().includes(needle));
            if (!matched) {
              return {
                ok: false,
                error: `Collection "${input.ringCollectionTitle}" was not found. Available: ${cur.collections.map((c) => c.title).join(", ") || "none"}.`,
              };
            }
            nextId = matched.id;
            changedLabels.push(`Ring Collection: ${matched.title}`);
          }

          setSelectedId(nextId);
          setBuilderEnabled(nextBuilderEnabled);
          setEnabledCategories(nextCategories);
          step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

          const shouldSave = input.saveNow !== false;
          if (shouldSave) {
            cur.fetcher.submit(
              {
                intent: "save",
                ringCollectionId: nextId,
                builderEnabled: String(nextBuilderEnabled),
                enabledCategories: JSON.stringify(nextCategories),
              },
              { method: "post" },
            );
            setSidekickNotice(
              changedLabels.length
                ? `Updated via Sidekick and saved to storefront: ${changedLabels.join(" · ")}`
                : "Saved current settings via Sidekick.",
            );
          } else {
            setSidekickNotice(
              changedLabels.length
                ? `Draft updated via Sidekick (${changedLabels.join(" · ")}). Click Save in the contextual bar above to publish.`
                : "Draft ready — click Save in the contextual bar above to publish.",
            );
          }

          const selectedCollection = cur.collections.find((c) => c.id === nextId);
          return {
            ok: true,
            saved: shouldSave,
            ringCollectionTitle: selectedCollection?.title || null,
            builderEnabled: nextBuilderEnabled,
            visibleCategories: nextCategories,
            summary: changedLabels.join(", "),
          };
        }),
      );
    }

    return () => {
      for (const unsub of cleanups) {
        if (typeof unsub === "function") unsub();
      }
    };
  }, [shopify]);

  const activeIntent =
    fetcher.state !== "idle" ? fetcher.formData?.get("intent") : null;
  const isCheckingEmbed = activeIntent === "check_embed";
  const isSaving = activeIntent === "save";
  const isRepairing = activeIntent === "repair_pages";

  const hasCollection = Boolean(setting?.ringCollectionTitle);
  const setupReady = Boolean(
    embedStatus?.enabled && hasCollection && setting?.builderEnabled,
  );
  const ringCollectionLiveUrl =
    setting?.ringCollectionUrl && storefrontBaseUrl
      ? `${storefrontBaseUrl}${setting.ringCollectionUrl}`
      : "";
  const themeEditorUrl = shop
    ? `https://${shop}/admin/themes/current/editor?context=apps`
    : "";

  const savedRingId = setting?.ringCollectionId || "";
  const savedBuilderEnabled = Boolean(setting?.builderEnabled ?? true);
  const savedCategories = normalizeEnabledCategories(setting?.enabledCategories);

  const isDirty = Boolean(
    setting &&
      (selectedId !== savedRingId ||
        Boolean(builderEnabled) !== savedBuilderEnabled ||
        enabledCategories.natural !== savedCategories.natural ||
        enabledCategories.lab !== savedCategories.lab ||
        enabledCategories.gemstones !== savedCategories.gemstones ||
        enabledCategories.colored !== savedCategories.colored),
  );

  const checkEmbed = () => {
    fetcher.submit({ intent: "check_embed" }, { method: "post" });
  };

  const saveSettings = () => {
    setSidekickNotice("");
    fetcher.submit(
      {
        intent: "save",
        ringCollectionId: selectedId,
        builderEnabled: String(builderEnabled),
        enabledCategories: JSON.stringify(enabledCategories),
      },
      { method: "post" },
    );
  };

  const discardSettings = () => {
    setSelectedId(savedRingId);
    setBuilderEnabled(savedBuilderEnabled);
    setEnabledCategories(savedCategories);
    setSidekickNotice("");
  };

  const repairPages = () => {
    fetcher.submit({ intent: "repair_pages" }, { method: "post" });
  };

  const inventoryCards = [
    { label: "Total Diamonds", value: counts.all },
    { label: "Natural", value: counts.natural },
    { label: "Lab Grown", value: counts.lab },
    { label: "Gemstones", value: counts.gemstones },
    { label: "Colored", value: counts.colored },
  ];

  return (
    <>
      <SaveBar id="wsc-settings-save-bar" open={isDirty} discardConfirmation>
        <button
          variant="primary"
          loading={isSaving ? "" : undefined}
          disabled={isSaving}
          onClick={saveSettings}
        />
        <button disabled={isSaving} onClick={discardSettings} />
      </SaveBar>
      <s-page heading="Dashboard" inlinesize="base">
      <s-stack direction="block" gap="base">
        {authError && (
          <s-banner tone="critical" heading="Authentication issue">
            {authError}
          </s-banner>
        )}

        {fetcher.data?.error && (
          <s-banner tone="critical" heading="Action failed">
            {fetcher.data.error}
          </s-banner>
        )}

        {fetcher.data?.warning && (
          <s-banner tone="warning" heading="Partial sync">
            {fetcher.data.warning}
          </s-banner>
        )}

        {sidekickNotice && (
          <s-banner
            tone="info"
            heading="Sidekick customization"
            dismissible
            onDismiss={() => setSidekickNotice("")}
          >
            {sidekickNotice}
          </s-banner>
        )}

        {!authError && (
          <s-banner
            tone={setupReady ? "success" : "info"}
            heading={
              setupReady
                ? "Diamond Ring Builder is live on your storefront"
                : !embedStatus?.enabled
                  ? "Step 1 of 2: Enable the Theme App Embed to start"
                  : !hasCollection
                    ? "Step 2 of 2: Select your Ring Collection to finish onboarding"
                    : "Storefront builder is paused"
            }
          >
            <s-text>
              {setupReady
                ? `Connected to ${setting.ringCollectionTitle} with ${counts.all.toLocaleString()} active stones.`
                : !embedStatus?.enabled
                  ? "Turn on the Diamond Ring Builder embed in your live theme, then verify status below."
                  : !hasCollection
                    ? "Choose the Shopify collection containing your ring settings below."
                    : "Turn on the Build Your Own Ring toggle in Step 2 whenever you are ready to show it to shoppers."}
            </s-text>
          </s-banner>
        )}

        <div ref={step1Ref}>
          <s-section heading="Step 1: Enable Theme App Embed">
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-badge tone={embedStatus?.enabled ? "success" : "warning"}>
                  {embedStatus?.enabled
                    ? `Enabled${embedStatus?.themeName ? ` · ${embedStatus.themeName}` : ""}`
                    : embedStatus?.checked
                      ? `Not enabled${embedStatus?.themeName ? ` · ${embedStatus.themeName}` : ""}`
                      : "Status unavailable"}
                </s-badge>
              </s-stack>

              <s-text color="subdued">
                Open your Shopify Theme Customizer, go to App Embeds, turn on{" "}
                <strong>Diamond Ring Builder</strong>, click Save in the theme editor, then
                click Check Embed Status here.
              </s-text>

              <s-stack direction="inline" gap="small">
                {themeEditorUrl && (
                  <s-button
                    variant={embedStatus?.enabled ? "secondary" : "primary"}
                    href={themeEditorUrl}
                    target="_blank"
                  >
                    Open Theme App Embeds
                  </s-button>
                )}
                <s-button
                  variant="secondary"
                  loading={isCheckingEmbed}
                  disabled={isCheckingEmbed}
                  onClick={checkEmbed}
                >
                  {isCheckingEmbed ? "Checking…" : "Check Embed Status"}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </div>

        <div ref={step2Ref}>
          <s-section heading="Step 2: Ring Collection & Storefront Visibility">
            <s-stack direction="block" gap="base">
              <s-select
                label="Ring Collection"
                name="ringCollectionId"
                value={selectedId}
                details="Customers start Build Your Own Ring from products inside this collection."
                onChange={(e) =>
                  setSelectedId(e.currentTarget?.value ?? e.target?.value ?? "")
                }
              >
                <s-option value="" selected={!selectedId}>
                  Select a ring collection…
                </s-option>
                {collections.map((col) => (
                  <s-option
                    key={col.id}
                    value={col.id}
                    selected={selectedId === col.id}
                  >
                    {col.title} ({col.productsCount} products)
                  </s-option>
                ))}
              </s-select>

              <s-switch
                label="Enable Build Your Own Ring on storefront"
                checked={builderEnabled}
                onChange={(e) =>
                  setBuilderEnabled(
                    Boolean(e.currentTarget?.checked ?? e.target?.checked),
                  )
                }
              />

              <s-stack direction="block" gap="small-100">
                <s-text fontWeight="semibold">
                  Visible Diamond Categories on Storefront
                </s-text>
                <s-text color="subdued" fontSize="small">
                  Uncheck any category to hide it from your storefront builder strip, popups, and listing pages.
                </s-text>
                <s-grid
                  gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
                  gap="small-100"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <s-checkbox
                      key={cat.key}
                      label={cat.label}
                      checked={enabledCategories[cat.key]}
                      onChange={(e) => {
                        const checked = Boolean(
                          e.currentTarget?.checked ?? e.target?.checked,
                        );
                        setEnabledCategories((prev) => ({
                          ...prev,
                          [cat.key]: checked,
                        }));
                      }}
                    />
                  ))}
                </s-grid>
              </s-stack>

              {ringCollectionLiveUrl && (
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-text color="subdued" fontSize="small">
                    Active storefront collection:
                  </s-text>
                  <s-link href={ringCollectionLiveUrl} target="_blank">
                    {ringCollectionLiveUrl}
                  </s-link>
                </s-stack>
              )}
            </s-stack>
          </s-section>
        </div>

        <s-section heading="Diamond Inventory">
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))"
            gap="small"
          >
            {inventoryCards.map((item) => (
              <s-box
                key={item.label}
                background="subdued"
                border="base"
                borderRadius="base"
                padding="small"
              >
                <s-stack direction="block" gap="small-100">
                  <s-text color="subdued" fontSize="small">
                    {item.label}
                  </s-text>
                  <s-text fontWeight="bold" fontSize="large">
                    {item.value.toLocaleString()}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
        </s-section>

        <s-section heading="Live Storefront Pages">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">
              Direct storefront links for your Diamond Builder experience.
            </s-text>

            <s-stack direction="block" gap="small">
              {pages.map((p) => {
                const isHidden =
                  p.key !== "detail" && enabledCategories[p.key] === false;
                return (
                  <s-box
                    key={p.key}
                    background="subdued"
                    border="base"
                    borderRadius="base"
                    padding="small"
                  >
                    <s-stack
                      direction="inline"
                      gap="small"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      {p.liveUrl ? (
                        <s-link href={p.liveUrl} target="_blank">
                          {p.liveUrl}
                        </s-link>
                      ) : (
                        <s-text color="subdued">
                          Pending creation — click Sync Storefront Pages below.
                        </s-text>
                      )}
                      {isHidden && <s-badge tone="neutral">Hidden on storefront</s-badge>}
                    </s-stack>
                  </s-box>
                );
              })}
            </s-stack>

            <s-stack direction="inline" gap="small">
              <s-button
                variant="secondary"
                loading={isRepairing}
                disabled={isRepairing}
                onClick={repairPages}
              >
                {isRepairing ? "Syncing pages…" : "Sync Storefront Pages"}
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
    </>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
