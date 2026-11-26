(function () {
  var cfg = window.__WSC_DR_CONFIG__;
  if (!cfg) return;

  var nativeFetch = window.fetch.bind(window);
  var DIAMOND_KEY = "wsc_byor_diamond";
  var PREVIEW_KEY = "wsc_byor_diamond_preview";
  var SETTING_KEY = "wsc_byor_setting";

  function readJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, val) {
    try {
      if (val === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* ignore storage errors */
    }
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoney(amount) {
    var num = Number(amount || 0);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cfg.currency || "USD",
        maximumFractionDigits: 0,
      }).format(num);
    } catch {
      return "$" + Math.round(num).toLocaleString();
    }
  }

  function isReviewMode() {
    return new URLSearchParams(window.location.search).get("review") === "1";
  }

  function appendReviewParam(url) {
    if (!url) return "#";
    return url + (url.indexOf("?") === -1 ? "?review=1" : "&review=1");
  }

  function isCategoryEnabled(key) {
    if (!cfg.enabledCategories) return true;
    return cfg.enabledCategories[key] !== false;
  }

  function getFirstEnabledDiamondUrl() {
    var pages = cfg.pages || {};
    var order = ["natural", "lab", "gemstones", "colored"];
    for (var i = 0; i < order.length; i += 1) {
      var key = order[i];
      if (isCategoryEnabled(key) && pages[key]) {
        return pages[key];
      }
    }
    return "#";
  }

  function getActiveProductVariant() {
    if (!cfg.product || !Array.isArray(cfg.product.variants)) return null;
    var idEl = document.querySelector(
      'form[action*="/cart/add"] input[name="id"], form[action*="/cart/add"] select[name="id"]'
    );
    var activeId = idEl ? Number(idEl.value) : Number(cfg.product.selectedVariantId);
    return (
      cfg.product.variants.find(function (v) {
        return Number(v.id) === activeId;
      }) || cfg.product.variants[0]
    );
  }

  function closePopup() {
    var existing = document.querySelector(".wsc-popup-backdrop");
    if (existing) existing.remove();
  }

  function openPopup(title, description, bodyHtml) {
    closePopup();
    var backdrop = document.createElement("div");
    backdrop.className = "wsc-popup-backdrop";
    backdrop.innerHTML =
      '<div class="wsc-popup" role="dialog" aria-modal="true">' +
      '<button type="button" class="wsc-popup-close" aria-label="Close">&times;</button>' +
      '<h3 class="wsc-popup-title">' + esc(title) + "</h3>" +
      '<p class="wsc-popup-desc">' + esc(description) + "</p>" +
      bodyHtml +
      "</div>";

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop || e.target.classList.contains("wsc-popup-close")) {
        closePopup();
      }
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openChooseDiamondPagePopup() {
    var pages = cfg.pages || {};
    var entries = [
      { key: "natural", label: "Natural Diamonds", sub: "Earth-mined certified stones", primary: true },
      { key: "lab", label: "Lab Grown Diamonds", sub: "Eco-conscious brilliance" },
      { key: "gemstones", label: "Gemstones", sub: "Sapphire, emerald & more" },
      { key: "colored", label: "Colored Diamonds", sub: "Rare fancy hues" },
    ].filter(function (item) {
      return isCategoryEnabled(item.key) && Boolean(pages[item.key]);
    });

    if (!entries.length) {
      window.alert("No diamond categories are currently enabled for your storefront.");
      return;
    }

    var body =
      '<div class="wsc-popup-options">' +
      entries
        .map(function (item) {
          return (
            '<button type="button" class="wsc-popup-btn' +
            (item.primary ? " wsc-popup-btn--primary" : "") +
            '" data-wsc-go="' +
            esc(pages[item.key]) +
            '"><strong>' +
            esc(item.label) +
            "</strong><span>" +
            esc(item.sub) +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";

    var modal = openPopup(
      "Select Your Center Stone",
      "Your ring setting has been saved. Choose which diamond collection you want to browse next:",
      body
    );

    modal.querySelectorAll("[data-wsc-go]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.location.href = btn.getAttribute("data-wsc-go");
      });
    });
  }

  function openDiamondSelectedPopup(diamond) {
    var setting = readJson(SETTING_KEY);
    var ringHref = cfg.ringCollectionUrl || "";

    var primaryLabel = setting
      ? "Complete Your Ring (Review)"
      : "Choose a Ring Setting";
    var primarySub = setting
      ? "Pair with " + setting.title
      : ringHref
        ? "Browse " + (cfg.ringCollectionTitle || "Ring Settings")
        : "Select a Ring Collection in Dashboard";

    var body =
      '<div class="wsc-popup-stack">' +
      '<button type="button" class="wsc-popup-btn wsc-popup-btn--primary" data-wsc-action="ring"' +
      (!setting && !ringHref ? " disabled" : "") +
      ">" +
      "<strong>" + esc(primaryLabel) + "</strong>" +
      "<span>" + esc(primarySub) + "</span>" +
      "</button>" +
      '<button type="button" class="wsc-popup-btn" data-wsc-action="cart">' +
      "<strong>Add Diamond Directly</strong>" +
      "<span>" + esc(diamond.title || "Selected Diamond") + " · " + esc(formatMoney(diamond.price)) + "</span>" +
      "</button>" +
      "</div>";

    var modal = openPopup(
      "Diamond Selected for Builder",
      (diamond.title || "Selected Diamond") + " (" + formatMoney(diamond.price) + ")",
      body
    );

    modal.querySelector('[data-wsc-action="ring"]').addEventListener("click", function () {
      if (setting && setting.url) {
        window.location.href = appendReviewParam(setting.url);
      } else if (ringHref) {
        window.location.href = ringHref;
      }
    });

    modal.querySelector('[data-wsc-action="cart"]').addEventListener("click", function () {
      var actionBtn = modal.querySelector('[data-wsc-action="cart"]');
      var titleEl = actionBtn ? actionBtn.querySelector("strong") : null;
      var origLabel = titleEl ? titleEl.textContent : "";
      if (actionBtn) actionBtn.disabled = true;
      if (titleEl) titleEl.textContent = "Preparing Diamond for Cart…";
      if (setting && setting.variantId) {
        addCombinedToCart(setting, diamond).finally(function () {
          closePopup();
          if (actionBtn) actionBtn.disabled = false;
          if (titleEl) titleEl.textContent = origLabel;
        });
      } else {
        addLooseDiamondToCart(diamond).finally(function () {
          closePopup();
          if (actionBtn) actionBtn.disabled = false;
          if (titleEl) titleEl.textContent = origLabel;
        });
      }
    });
  }

  function renderStrip() {
    if (cfg.isCart || (!cfg.isRingCollection && !cfg.isRingProduct && !cfg.pageType)) {
      var existingStrip = document.querySelector(".wsc-strip");
      if (existingStrip) existingStrip.remove();
      return;
    }
    var diamond = readJson(DIAMOND_KEY);
    var setting = readJson(SETTING_KEY);
    var review = isReviewMode();
    var bothReady = Boolean(diamond && setting);

    var mountTarget =
      document.querySelector("main") ||
      document.querySelector("#MainContent") ||
      document.body;
    if (!mountTarget) return;

    var strip = document.querySelector(".wsc-strip");
    if (!strip) {
      strip = document.createElement("section");
      strip.className = "wsc-strip";
      strip.setAttribute("aria-label", "Build Your Own Ring Steps");
      mountTarget.insertBefore(strip, mountTarget.firstChild);
    }

    var ringHref = cfg.ringCollectionUrl || "#";
    var diamondHref = getFirstEnabledDiamondUrl();
    var reviewHref = setting && setting.url ? appendReviewParam(setting.url) : "#";

    var step1Class =
      "wsc-step " +
      (setting ? "wsc-step--done" : cfg.isRingCollection || cfg.isRingProduct ? "wsc-step--active" : "");
    var step2Class =
      "wsc-step " +
      (diamond ? "wsc-step--done" : cfg.pageType ? "wsc-step--active" : "");
    var step3Class =
      "wsc-step " +
      (review && bothReady ? "wsc-step--active" : bothReady ? "wsc-step--done" : "");

    strip.innerHTML =
      '<div class="wsc-strip-bar">' +
      '<div class="' + step1Class + '">' +
      '<a href="' + esc(setting ? setting.url : ringHref) + '" class="wsc-step-main">' +
      (setting && setting.image
        ? '<img class="wsc-step-thumb" src="' + esc(setting.image) + '" alt="">'
        : '<span class="wsc-step-num">' + (setting ? "✓" : "1") + "</span>") +
      '<div class="wsc-step-text">' +
      '<div class="wsc-step-title">1. Choose Setting</div>' +
      '<div class="wsc-step-sub">' +
      (setting
        ? esc(setting.title + " · " + formatMoney(setting.price))
        : esc(cfg.ringCollectionTitle || "Select ring mount")) +
      "</div></div></a>" +
      (setting
        ? '<div class="wsc-step-actions"><button type="button" class="wsc-step-clear" data-wsc-clear="setting" title="Remove setting">&times;</button></div>'
        : "") +
      "</div>" +

      '<div class="' + step2Class + '">' +
      '<a href="' + esc(diamond && diamond.detailUrl ? diamond.detailUrl : diamondHref) + '" class="wsc-step-main">' +
      (diamond && diamond.image
        ? '<img class="wsc-step-thumb" src="' + esc(diamond.image) + '" alt="">'
        : '<span class="wsc-step-num">' + (diamond ? "✓" : "2") + "</span>") +
      '<div class="wsc-step-text">' +
      '<div class="wsc-step-title">2. Choose Diamond</div>' +
      '<div class="wsc-step-sub">' +
      (diamond
        ? esc((diamond.title || "Diamond") + " · " + formatMoney(diamond.price))
        : "Natural, Lab, Gemstone, Color") +
      "</div></div></a>" +
      (diamond
        ? '<div class="wsc-step-actions"><button type="button" class="wsc-step-clear" data-wsc-clear="diamond" title="Remove diamond">&times;</button></div>'
        : "") +
      "</div>" +

      '<a href="' + esc(bothReady ? reviewHref : "#") + '" class="' + step3Class + '"' +
      (bothReady ? "" : ' onclick="return false;"') +
      ">" +
      '<div class="wsc-step-main' + (bothReady ? "" : " wsc-step-main--disabled") + '">' +
      '<span class="wsc-step-num">3</span>' +
      '<div class="wsc-step-text">' +
      '<div class="wsc-step-title">3. Complete Ring</div>' +
      '<div class="wsc-step-sub">' +
      (bothReady
        ? "Total " + esc(formatMoney(Number(setting.price || 0) + Number(diamond.price || 0))) + " · Review"
        : "Select setting &amp; diamond") +
      "</div></div></div></a>" +
      "</div>";

    strip.querySelectorAll("[data-wsc-clear]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var which = btn.getAttribute("data-wsc-clear");
        if (which === "setting") writeJson(SETTING_KEY, null);
        if (which === "diamond") writeJson(DIAMOND_KEY, null);
        if (isReviewMode()) {
          window.location.href = cfg.product ? cfg.product.url : window.location.pathname;
          return;
        }
        renderStrip();
        window.dispatchEvent(new CustomEvent("wsc:byor-state-changed"));
      });
    });
  }

  function getAbsoluteDetailUrl(diamond) {
    var detailBase = (cfg.pages && cfg.pages.detail) || "";
    if (!detailBase || !diamond || !diamond.id) return "";
    var sep = detailBase.indexOf("?") === -1 ? "?" : "&";
    var path = detailBase + sep + "pid=" + encodeURIComponent(diamond.id);
    if (/^https?:\/\//i.test(path)) return path;
    return window.location.origin + path;
  }

  function prepareDiamondForCart(diamond, setting, bundleId) {
    var apiBase = (cfg.appUrl || "").replace(/\/+$/, "");
    var detailUrl = getAbsoluteDetailUrl(diamond);
    if (!apiBase || !cfg.shop || !diamond || !diamond.id) {
      return Promise.resolve({
        ok: true,
        mode: "properties_only",
        sku: diamond ? diamond.stockId || "" : "",
        detailUrl: detailUrl,
        ringMappingId: setting ? String(setting.productId || "") : "",
        diamond: diamond,
      });
    }
    return fetch(apiBase + "/api/cart-prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        shop: cfg.shop,
        diamondId: diamond.id,
        ringProductId: setting ? String(setting.productId || "") : "",
        ringVariantId: setting ? String(setting.variantId || "") : "",
        ringTitle: setting ? String(setting.title || "") : "",
        detailPageUrl: detailUrl,
        bundleId: bundleId || "",
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .catch(function () {
        return {
          ok: true,
          mode: "properties_only",
          sku: diamond.stockId || "",
          detailUrl: detailUrl,
          ringMappingId: setting ? String(setting.productId || "") : "",
          diamond: diamond,
        };
      });
  }

  function buildDiamondProps(diamond, extra) {
    return Object.assign(
      {
        Diamond: diamond.title || "",
        SKU: diamond.stockId || "",
        "Report #": diamond.ReportNo || "",
        Shape: diamond.shape || "",
        Carat: diamond.carats != null ? String(diamond.carats) + " ct" : "",
        Color: diamond.colore || "",
        Clarity: diamond.clarity || "",
        Cut: diamond.cut || "",
        Certificate: [diamond.certificate, diamond.ReportNo].filter(Boolean).join(" "),
        Measurements: diamond.measurement || "",
        "Diamond Price": formatMoney(diamond.price),
      },
      extra || {}
    );
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function waitUntilDiamondReady(handle) {
    if (!handle) return Promise.resolve(false);
    var attempt = 0;
    var maxAttempts = 12;

    function poll() {
      attempt += 1;
      return nativeFetch("/products/" + encodeURIComponent(handle) + ".js?cacheBust=" + Date.now(), {
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (!res.ok) return false;
          return res.json().then(function (p) {
            return Boolean(
              p &&
                (p.available === true ||
                  (Array.isArray(p.variants) && p.variants[0] && p.variants[0].available))
            );
          });
        })
        .catch(function () {
          return false;
        })
        .then(function (ready) {
          if (ready) return true;
          if (attempt >= maxAttempts) return false;
          return sleep(850).then(poll);
        });
    }

    return poll();
  }

  function isDiamondInCart(diamond, skuOverride) {
    if (!diamond || !diamond.id) return Promise.resolve(false);
    var targetId = String(diamond.id);
    var targetSku = String(skuOverride || diamond.stockId || "").trim();
    return nativeFetch("/cart.json", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        var items = (cart && cart.items) || [];
        return items.some(function (item) {
          var props = item.properties || {};
          if (props._wsc_diamond_id && String(props._wsc_diamond_id) === targetId) return true;
          if (targetSku && (String(item.sku || "") === targetSku || String(props.SKU || "") === targetSku)) {
            return true;
          }
          return false;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function postCartAdd(items, maxAttempts) {
    var totalTries = maxAttempts || 4;

    function tryPost(attempt) {
      return nativeFetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: items }),
      }).then(function (res) {
        if (res.status === 422 && attempt < totalTries) {
          return sleep(1400).then(function () {
            return tryPost(attempt + 1);
          });
        }
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (errJson) {
              throw new Error(
                (errJson && (errJson.description || errJson.message)) ||
                  "Failed to add items to cart (" + res.status + ")"
              );
            });
        }
        return res.json();
      });
    }

    return tryPost(1);
  }

  function addLooseDiamondToCart(diamond) {
    return isDiamondInCart(diamond)
      .then(function (alreadyInCart) {
        if (alreadyInCart) {
          var savedDia = readJson(DIAMOND_KEY);
          if (savedDia && String(savedDia.id) === String(diamond.id)) {
            writeJson(DIAMOND_KEY, null);
          }
          window.location.href = "/cart";
          return null;
        }
        return prepareDiamondForCart(diamond, null, "").then(function (prep) {
          if (prep && prep.ok === false) {
            throw new Error(prep.error || "Selected diamond is no longer available.");
          }
          var stone = (prep && prep.diamond) || diamond;
          var detailUrl = (prep && prep.detailUrl) || getAbsoluteDetailUrl(stone);
          var sku = (prep && prep.sku) || stone.stockId || "";
          if (!prep || !prep.diamondVariantNumericId) {
            window.alert(
              "Unable to add a standalone diamond right now. Select a ring setting to bundle it, or grant product publication permissions in the app."
            );
            return null;
          }
          var readyPromise =
            prep.notNew === false && prep.diamondProductHandle
              ? waitUntilDiamondReady(prep.diamondProductHandle)
              : Promise.resolve(true);

          return readyPromise
            .then(function () {
              return postCartAdd([
                {
                  id: Number(prep.diamondVariantNumericId),
                  quantity: 1,
                  properties: buildDiamondProps(stone, {
                    SKU: sku,
                    "Diamond Detail": detailUrl,
                    _wsc_diamond_id: String(stone.id || ""),
                    _wsc_byor_role: "diamond",
                  }),
                },
              ]);
            })
            .then(function () {
              var currentSelected = readJson(DIAMOND_KEY);
              if (currentSelected && String(currentSelected.id) === String(stone.id)) {
                writeJson(DIAMOND_KEY, null);
              }
              window.location.href = "/cart";
            });
        });
      })
      .catch(function (err) {
        console.error("[byor-strip] Loose diamond cart error:", err);
        window.alert(err && err.message ? err.message : "Could not add diamond to cart. Please try again.");
      });
  }

  function addCombinedToCart(setting, diamond) {
    var bundleId =
      "wsc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);

    return prepareDiamondForCart(diamond, setting, bundleId)
      .then(function (prep) {
        if (prep && prep.ok === false) {
          throw new Error(prep.error || "Selected diamond is no longer available.");
        }
        var stone = (prep && prep.diamond) || diamond;
        var detailUrl = (prep && prep.detailUrl) || getAbsoluteDetailUrl(stone);
        var sku = (prep && prep.sku) || stone.stockId || "";
        var ringMapId = (prep && prep.ringMappingId) || String(setting.productId || "");
        var total = Number(setting.price || 0) + Number(stone.price || 0);
        var paired = Boolean(prep && prep.mode === "paired_variants" && prep.diamondVariantNumericId);

        var readyPromise =
          paired && prep.notNew === false && prep.diamondProductHandle
            ? waitUntilDiamondReady(prep.diamondProductHandle)
            : Promise.resolve(true);

        var settingProps = buildDiamondProps(stone, {
          SKU: sku,
          "Diamond Detail": detailUrl,
          _wsc_byor_bundle: bundleId,
          _wsc_byor_role: "setting",
          _wsc_paired: paired ? "true" : "false",
          _wsc_diamond_id: String(stone.id || ""),
          _wsc_ring_mapping_id: ringMapId,
          "Setting Price": formatMoney(setting.price),
          "Combined Ring Total": formatMoney(total),
        });

        var items = [];
        if (paired) {
          items.push({
            id: Number(prep.diamondVariantNumericId),
            quantity: 1,
            properties: buildDiamondProps(stone, {
              SKU: sku,
              "Diamond Detail": detailUrl,
              _wsc_byor_bundle: bundleId,
              _wsc_byor_role: "diamond",
              _wsc_paired: "true",
              _wsc_diamond_id: String(stone.id || ""),
              _wsc_ring_mapping_id: ringMapId,
              "Paired Setting": setting.title || "",
              "Combined Ring Total": formatMoney(total),
            }),
          });
        }

        items.push({
          id: Number(setting.variantId),
          quantity: 1,
          properties: settingProps,
        });

        return readyPromise
          .then(function () {
            return postCartAdd(items);
          })
          .then(function () {
            writeJson(DIAMOND_KEY, null);
            writeJson(SETTING_KEY, null);
            writeJson(PREVIEW_KEY, null);
            window.location.href = "/cart";
          });
      })
      .catch(function (err) {
        console.error("[byor-strip] Cart error:", err);
        window.alert(err && err.message ? err.message : "Could not add the ring bundle to cart. Please try again.");
      });
  }

  function injectHiddenPropertyInputs(form, props) {
    form.querySelectorAll("[data-wsc-prop-input]").forEach(function (el) {
      el.remove();
    });
    Object.keys(props).forEach(function (key) {
      var val = props[key];
      if (!val) return;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "properties[" + key + "]";
      input.value = String(val);
      input.setAttribute("data-wsc-prop-input", "1");
      form.appendChild(input);
    });
  }

  function setupRingProductPage() {
    if (!cfg.isRingProduct || !cfg.product) return;
    var form = document.querySelector('form[action*="/cart/add"]');
    if (!form) return;

    var nativeSubmit = form.querySelector(
      'button[name="add"], button[type="submit"], .product-form__submit'
    );
    var paymentButtons = form.querySelectorAll(".shopify-payment-button");

    var diamond = readJson(DIAMOND_KEY);
    var setting = readJson(SETTING_KEY);
    var review = isReviewMode();

    // Case A: Review mode (?review=1) with Diamond + Setting selected
    if (review && diamond) {
      if (!setting || Number(setting.productId) !== Number(cfg.product.id)) {
        var activeVar = getActiveProductVariant();
        setting = {
          productId: cfg.product.id,
          title: cfg.product.title,
          url: cfg.product.url,
          image: cfg.product.image,
          variantId: activeVar ? activeVar.id : cfg.product.selectedVariantId,
          variantTitle: activeVar ? activeVar.title : "",
          price: activeVar ? activeVar.price : 0,
        };
        writeJson(SETTING_KEY, setting);
        renderStrip();
      }

      document
        .querySelectorAll(
          "variant-selects, variant-radios, .product-form__input, quantity-input, .product-form__quantity, .shopify-payment-button"
        )
        .forEach(function (el) {
          el.classList.add("wsc-hidden-control");
        });

      // Hide native theme submit so Dawn's <product-form> never intercepts before our bundle call
      if (nativeSubmit) nativeSubmit.classList.add("wsc-hidden-control");

      var total = Number(setting.price || 0) + Number(diamond.price || 0);
      injectHiddenPropertyInputs(
        form,
        buildDiamondProps(diamond, {
          _wsc_diamond_id: String(diamond.id || ""),
          "Setting Price": formatMoney(setting.price),
          "Combined Ring Total": formatMoney(total),
        })
      );

      var reviewBox = document.createElement("div");
      reviewBox.className = "wsc-review-box";
      reviewBox.innerHTML =
        '<div class="wsc-review-head"><span>Your Custom Ring Summary</span><span>Complete Bundle</span></div>' +
        '<div class="wsc-review-item">' +
        (setting.image ? '<img class="wsc-review-thumb" src="' + esc(setting.image) + '" alt="">' : "") +
        '<div class="wsc-review-meta">' +
        '<div class="wsc-review-title">' + esc(setting.title) + "</div>" +
        '<div class="wsc-review-sub">Setting · ' + esc(setting.variantTitle || "Standard") + "</div>" +
        "</div>" +
        '<div class="wsc-review-price">' + esc(formatMoney(setting.price)) + "</div>" +
        "</div>" +
        '<div class="wsc-review-item">' +
        (diamond.image ? '<img class="wsc-review-thumb" src="' + esc(diamond.image) + '" alt="">' : "") +
        '<div class="wsc-review-meta">' +
        '<div class="wsc-review-title">' + esc(diamond.title || "Selected Diamond") + "</div>" +
        '<div class="wsc-review-sub">' +
        esc(
          [
            diamond.shape,
            diamond.carats ? diamond.carats + "ct" : "",
            diamond.colore ? "Color " + diamond.colore : "",
            diamond.clarity ? diamond.clarity : "",
            diamond.certificate || "",
          ]
            .filter(Boolean)
            .join(" · ")
        ) +
        "</div></div>" +
        '<div class="wsc-review-price">' + esc(formatMoney(diamond.price)) + "</div>" +
        "</div>" +
        '<div class="wsc-review-total"><span>Total Price</span><span>' + esc(formatMoney(total)) + "</span></div>";

      var bundleBtn = document.createElement("button");
      bundleBtn.type = "button";
      bundleBtn.id = "wsc-add-bundle-btn";
      bundleBtn.className = "wsc-choose-btn";
      bundleBtn.textContent = "Add Ring & Diamond to Cart · " + formatMoney(total);

      bundleBtn.addEventListener("click", function () {
        bundleBtn.disabled = true;
        bundleBtn.textContent = "Adding Custom Ring to Cart…";
        addCombinedToCart(setting, diamond).finally(function () {
          bundleBtn.disabled = false;
          bundleBtn.textContent = "Add Ring & Diamond to Cart · " + formatMoney(total);
        });
      });

      if (nativeSubmit && nativeSubmit.parentNode) {
        nativeSubmit.parentNode.insertBefore(reviewBox, nativeSubmit);
        nativeSubmit.parentNode.insertBefore(bundleBtn, nativeSubmit);
      } else {
        form.insertBefore(reviewBox, form.firstChild);
        form.appendChild(bundleBtn);
      }

      form.addEventListener(
        "submit",
        function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          bundleBtn.click();
        },
        true
      );
      return;
    }

    // Case B: Normal Ring Collection PDP -> replace Add to Cart with "Choose This Setting"
    if (nativeSubmit) nativeSubmit.classList.add("wsc-hidden-control");
    paymentButtons.forEach(function (el) {
      el.classList.add("wsc-hidden-control");
    });

    if (!form.querySelector(".wsc-choose-btn")) {
      var chooseBtn = document.createElement("button");
      chooseBtn.type = "button";
      chooseBtn.className = "wsc-choose-btn";
      chooseBtn.textContent = "Choose This Setting";

      if (nativeSubmit && nativeSubmit.parentNode) {
        nativeSubmit.parentNode.insertBefore(chooseBtn, nativeSubmit);
      } else {
        form.appendChild(chooseBtn);
      }

      chooseBtn.addEventListener("click", function () {
        var variant = getActiveProductVariant();
        var nextSetting = {
          productId: cfg.product.id,
          title: cfg.product.title,
          url: cfg.product.url,
          image: cfg.product.image,
          variantId: variant ? variant.id : cfg.product.selectedVariantId,
          variantTitle: variant ? variant.title : "",
          price: variant ? variant.price : 0,
          selectedAt: new Date().toISOString(),
        };
        writeJson(SETTING_KEY, nextSetting);
        renderStrip();

        var existingDiamond = readJson(DIAMOND_KEY);
        if (existingDiamond) {
          window.location.href = appendReviewParam(cfg.product.url);
        } else {
          openChooseDiamondPagePopup();
        }
      });

      // Case C: Setting-only fallback (buy mounting without a diamond)
      if (!form.querySelector("#wsc-add-setting-only-btn")) {
        var settingOnlyBtn = document.createElement("button");
        settingOnlyBtn.type = "button";
        settingOnlyBtn.id = "wsc-add-setting-only-btn";
        settingOnlyBtn.className = "wsc-setting-only-btn";
        settingOnlyBtn.textContent = "Add setting without a diamond";

        if (chooseBtn.nextSibling && chooseBtn.parentNode) {
          chooseBtn.parentNode.insertBefore(settingOnlyBtn, chooseBtn.nextSibling);
        } else if (chooseBtn.parentNode) {
          chooseBtn.parentNode.appendChild(settingOnlyBtn);
        }

        settingOnlyBtn.addEventListener("click", function () {
          var activeVar = getActiveProductVariant();
          var variantId = activeVar ? activeVar.id : cfg.product.selectedVariantId;
          if (!variantId) return;
          settingOnlyBtn.disabled = true;
          settingOnlyBtn.textContent = "Adding setting to cart…";
          postCartAdd([{ id: Number(variantId), quantity: 1 }])
            .then(function () {
              window.location.href = "/cart";
            })
            .catch(function (err) {
              console.error("[byor-strip] Setting-only cart error:", err);
              window.alert("Could not add setting to cart. Please try again.");
            })
            .finally(function () {
              settingOnlyBtn.disabled = false;
              settingOnlyBtn.textContent = "Add setting without a diamond";
            });
        });
      }
    }
  }

  var isReconcilingOrphans = false;

  function refreshCartDrawerSections() {
    nativeFetch("/?sections=cart-drawer,cart-icon-bubble", {
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (sections) {
        if (!sections) return;
        ["cart-drawer", "cart-icon-bubble"].forEach(function (secId) {
          if (!sections[secId]) return;
          var doc = new DOMParser().parseFromString(sections[secId], "text/html");
          var nextEl = doc.getElementById("shopify-section-" + secId) || doc.body.firstElementChild;
          var curEl = document.getElementById("shopify-section-" + secId);
          if (curEl && nextEl) {
            curEl.innerHTML = nextEl.innerHTML;
          }
        });
        document.dispatchEvent(new CustomEvent("cart:refresh"));
      })
      .catch(function () {
        /* ignore if theme does not expose standard Dawn section IDs */
      });
  }

  function reconcileOrphanBundles(fromInterceptedChange) {
    if (isReconcilingOrphans) return Promise.resolve(false);
    isReconcilingOrphans = true;

    return nativeFetch("/cart.json", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        var items = (cart && cart.items) || [];
        var bundles = new Map();

        items.forEach(function (item) {
          var props = item.properties || {};
          var bid = props._wsc_byor_bundle;
          if (!bid) return;
          if (!bundles.has(bid)) bundles.set(bid, []);
          bundles.get(bid).push(item);
        });

        // Clean up orphaned paired items cleanly when one half of a paired bundle was removed
        var orphanUpdates = {};
        var hasOrphans = false;
        bundles.forEach(function (group) {
          var isPaired = group.some(function (it) {
            return (it.properties || {})._wsc_paired === "true";
          });
          if (isPaired && group.length === 1) {
            orphanUpdates[group[0].key] = 0;
            hasOrphans = true;
          }
        });

        if (hasOrphans) {
          return nativeFetch("/cart/update.js", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ updates: orphanUpdates }),
          }).then(function () {
            if (cfg.isCart) {
              window.location.reload();
            } else if (fromInterceptedChange) {
              refreshCartDrawerSections();
            }
            return true;
          });
        }
        return false;
      })
      .catch(function (err) {
        console.warn("[byor-strip] Cart verification skipped:", err);
        return false;
      })
      .finally(function () {
        isReconcilingOrphans = false;
      });
  }

  function installCartDrawerInterceptor() {
    if (window.__wscFetchPatched) return;
    window.__wscFetchPatched = true;

    window.fetch = function (input, init) {
      var reqUrl = typeof input === "string" ? input : (input && input.url) || "";
      var isCartMutation = /\/cart\/(change|update)(\.js)?(\?|$)/i.test(reqUrl);
      var resultPromise = nativeFetch(input, init);
      if (isCartMutation && !isReconcilingOrphans) {
        resultPromise.then(function (res) {
          if (res && res.ok) {
            setTimeout(function () {
              reconcileOrphanBundles(true);
            }, 60);
          }
        });
      }
      return resultPromise;
    };
  }

  window.WscByor = {
    getState: function () {
      return {
        diamond: readJson(DIAMOND_KEY),
        setting: readJson(SETTING_KEY),
        preview: readJson(PREVIEW_KEY),
      };
    },
    isDiamondInCart: isDiamondInCart,
    savePreviewDiamond: function (diamond) {
      if (!diamond || !diamond.id) return;
      writeJson(PREVIEW_KEY, Object.assign({}, diamond, { cachedAt: Date.now() }));
    },
    getPreviewDiamond: function (id) {
      var cached = readJson(PREVIEW_KEY);
      if (cached && String(cached.id) === String(id)) return cached;
      var selected = readJson(DIAMOND_KEY);
      if (selected && String(selected.id) === String(id)) return selected;
      return null;
    },
    chooseDiamond: function (diamond) {
      var detailBase = (cfg.pages && cfg.pages.detail) || "";
      var detailUrl = detailBase
        ? detailBase + (detailBase.indexOf("?") === -1 ? "?" : "&") + "pid=" + encodeURIComponent(diamond.id)
        : "";
      var saved = Object.assign({}, diamond, {
        detailUrl: detailUrl,
        selectedAt: new Date().toISOString(),
      });
      writeJson(DIAMOND_KEY, saved);
      writeJson(PREVIEW_KEY, saved);
      renderStrip();
      window.dispatchEvent(new CustomEvent("wsc:byor-state-changed"));
      openDiamondSelectedPopup(saved);
    },
    appendReviewParam: appendReviewParam,
    renderStrip: renderStrip,
  };

  function boot() {
    installCartDrawerInterceptor();
    if (!cfg.isCart) {
      renderStrip();
      setupRingProductPage();
    } else {
      reconcileOrphanBundles(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
