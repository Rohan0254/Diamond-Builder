(function () {
  var cfg = window.__WSC_DR_CONFIG__;
  var Filters = window.WscDiamondFilters;
  if (!cfg || !Filters || !cfg.pageType) return;

  var LIST_STATE_PREFIX = "wsc_byor_list_";
  var activeController = null;
  var root = null;

  var defaultState = {
    pageType: cfg.pageType,
    viewMode: "grid",
    shape: "",
    cut: "",
    color: "",
    clarity: "",
    certificate: "",
    minCarat: "",
    maxCarat: "",
    minPrice: "",
    maxPrice: "",
    sort: "price_asc",
    page: 1,
    limit: 12,
  };

  function readCachedListState() {
    try {
      var raw = window.localStorage.getItem(LIST_STATE_PREFIX + cfg.pageType);
      return raw ? Object.assign({}, defaultState, JSON.parse(raw)) : Object.assign({}, defaultState);
    } catch {
      return Object.assign({}, defaultState);
    }
  }

  function saveCachedListState(next) {
    try {
      window.localStorage.setItem(LIST_STATE_PREFIX + cfg.pageType, JSON.stringify(next));
    } catch {
      /* ignore storage errors */
    }
  }

  var state = readCachedListState();

  function ensureMountRoot() {
    var existing = document.getElementById("diamond-builder-root");
    if (existing) {
      existing.classList.add("wsc-builder-mount");
      return existing;
    }

    // Upgrade legacy /embed/diamonds iframe or empty Shopify page body in place
    var legacyFrame = document.querySelector(
      'iframe[src*="/embed/diamonds"], iframe[src*="diamonds"], iframe[src*="embed/"]'
    );
    var node = document.createElement("div");
    node.id = "diamond-builder-root";
    node.className = "wsc-builder-mount";
    node.setAttribute("data-wsc-page", cfg.pageType);

    if (legacyFrame && legacyFrame.parentNode) {
      legacyFrame.parentNode.replaceChild(node, legacyFrame);
      return node;
    }

    var contentBox =
      document.querySelector("main .rte") ||
      document.querySelector("#MainContent .rte") ||
      document.querySelector("main .page-content") ||
      document.querySelector("main .page-width") ||
      document.querySelector("main") ||
      document.body;

    if (!contentBox) return null;
    if (contentBox.classList && contentBox.classList.contains("rte")) {
      contentBox.innerHTML = "";
    }
    contentBox.appendChild(node);
    return node;
  }

  root = ensureMountRoot();
  if (!root) return;

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

  function detailUrlFor(id, fromType) {
    var base = (cfg.pages && cfg.pages.detail) || "";
    if (!base) return "";
    var sep = base.indexOf("?") === -1 ? "?" : "&";
    var url = base + sep + "pid=" + encodeURIComponent(id);
    if (fromType && fromType !== "detail") {
      url += "&from=" + encodeURIComponent(fromType);
    }
    return url;
  }

  function goToDiamondDetail(diamond) {
    if (!diamond || !diamond.id) return;
    if (window.WscByor && typeof window.WscByor.savePreviewDiamond === "function") {
      window.WscByor.savePreviewDiamond(diamond);
    }
    var url = detailUrlFor(diamond.id, cfg.pageType);
    if (url) {
      window.location.href = url;
    } else if (window.WscByor) {
      window.WscByor.chooseDiamond(diamond);
    }
  }

  function getSelectedDiamondId() {
    var st = window.WscByor && window.WscByor.getState ? window.WscByor.getState() : null;
    return st && st.diamond ? String(st.diamond.id || "") : "";
  }

  function renderStoneMediaHtml(diamond, imgClass, svgSize) {
    var svg =
      '<div class="wsc-card-svg">' +
      Filters.getShapeSvg(diamond.shape, svgSize) +
      "</div>";
    if (!diamond.image) return svg;
    return (
      '<img class="' +
      imgClass +
      '" src="' +
      esc(diamond.image) +
      '" alt="' +
      esc(diamond.title || "Diamond") +
      '" loading="lazy" data-wsc-fallback-shape="' +
      esc(diamond.shape || "Round") +
      '" data-wsc-fallback-size="' +
      String(svgSize) +
      '">'
    );
  }

  function wireImageFallbacks(container) {
    container.querySelectorAll("img[data-wsc-fallback-shape]").forEach(function (img) {
      img.addEventListener("error", function () {
        var shape = img.getAttribute("data-wsc-fallback-shape") || "Round";
        var size = Number(img.getAttribute("data-wsc-fallback-size")) || 56;
        var wrap = document.createElement("div");
        wrap.className = "wsc-card-svg";
        wrap.innerHTML = Filters.getShapeSvg(shape, size);
        if (img.parentNode) img.parentNode.replaceChild(wrap, img);
      });
    });
  }

  function resolveBackUrl() {
    var params = new URLSearchParams(window.location.search);
    var from = (params.get("from") || "").toLowerCase();
    var pages = cfg.pages || {};
    var enabled = cfg.enabledCategories || {};
    if (from && pages[from] && enabled[from] !== false) {
      return pages[from];
    }
    var order = ["natural", "lab", "gemstones", "colored"];
    for (var i = 0; i < order.length; i += 1) {
      if (enabled[order[i]] !== false && pages[order[i]]) {
        return pages[order[i]];
      }
    }
    return "#";
  }

  function renderDetailView(diamond, isHydrating) {
    var selectedId = getSelectedDiamondId();
    var isSelected = Boolean(selectedId && String(diamond.id) === selectedId);
    var backHref = resolveBackUrl();

    var specCells = [
      ["Shape", diamond.shape || "—"],
      ["Carat Weight", diamond.carats != null ? diamond.carats + " ct" : "—"],
      ["Color", diamond.colore || "—"],
      ["Clarity", diamond.clarity || "—"],
      ["Cut", diamond.cut || "—"],
      ["Certificate", [diamond.certificate, diamond.ReportNo].filter(Boolean).join(" #") || "—"],
      ["Polish / Symmetry", [diamond.pol, diamond.symm].filter(Boolean).join(" / ") || "—"],
      ["Fluorescence", diamond.flo || "—"],
      ["Measurements", diamond.measurement || "—"],
      ["Depth / Table", [diamond.depth ? diamond.depth + "%" : "", diamond.table ? diamond.table + "%" : ""].filter(Boolean).join(" / ") || "—"],
    ];

    var mediaActions = [];
    if (diamond.video) {
      mediaActions.push(
        '<a class="wsc-btn-sm wsc-btn-sm--outline" href="' +
          esc(diamond.video) +
          '" target="_blank" rel="noopener noreferrer">360° Video</a>'
      );
    }
    if (diamond.pdf) {
      mediaActions.push(
        '<a class="wsc-btn-sm wsc-btn-sm--outline" href="' +
          esc(diamond.pdf) +
          '" target="_blank" rel="noopener noreferrer">View Lab Certificate</a>'
      );
    }

    root.innerHTML =
      '<div class="wsc-detail-topbar">' +
      '<a class="wsc-detail-back" href="' + esc(backHref) + '">← Back to Diamonds</a>' +
      (isHydrating ? '<span class="wsc-filter-subtitle">Refreshing live details…</span>' : "") +
      "</div>" +
      '<div class="wsc-detail">' +
      '<div class="wsc-detail-media-col">' +
      '<div class="wsc-detail-media">' +
      (diamond.certificate ? '<span class="wsc-cert-badge">' + esc(diamond.certificate) + "</span>" : "") +
      renderStoneMediaHtml(diamond, "wsc-detail-img", 110) +
      "</div>" +
      (mediaActions.length ? '<div class="wsc-detail-media-actions">' + mediaActions.join("") + "</div>" : "") +
      "</div>" +
      '<div class="wsc-detail-info">' +
      '<div class="wsc-detail-kicker">' +
      esc(diamond.category || "Diamond") +
      (diamond.stockId ? " · Stock #" + esc(diamond.stockId) : "") +
      "</div>" +
      '<h1 class="wsc-detail-title">' + esc(diamond.title || "Diamond") + "</h1>" +
      '<div class="wsc-detail-price-row">' +
      '<span class="wsc-detail-price">' + esc(formatMoney(diamond.price)) + "</span>" +
      (isSelected ? '<span class="wsc-detail-selected-pill">✓ Selected for Your Ring</span>' : "") +
      "</div>" +
      '<div class="wsc-detail-specs">' +
      specCells
        .map(function (cell) {
          return (
            '<div class="wsc-spec-cell">' +
            '<span class="wsc-spec-cell-label">' + esc(cell[0]) + "</span>" +
            '<span class="wsc-spec-cell-val">' + esc(cell[1]) + "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="wsc-detail-cta-row">' +
      '<button type="button" class="wsc-choose-btn' +
      (isSelected ? " wsc-choose-btn--selected" : "") +
      '" id="wsc-choose-diamond-btn">' +
      (isSelected ? "✓ Selected — Continue Pairing Setting" : "Select This Diamond") +
      "</button>" +
      "</div>" +
      "</div></div>";

    wireImageFallbacks(root);

    var btn = document.getElementById("wsc-choose-diamond-btn");
    if (btn && window.WscByor) {
      btn.addEventListener("click", function () {
        window.WscByor.chooseDiamond(diamond);
      });
    }
  }

  function loadDetailPage() {
    var pid = new URLSearchParams(window.location.search).get("pid");
    if (!pid) {
      root.innerHTML =
        '<div class="wsc-empty"><h3>No Diamond Selected</h3><p>Pick any stone from our diamond catalog to inspect its full details and select it.</p>' +
        '<div class="wsc-empty-links"><a class="wsc-btn-sm" href="' + esc(resolveBackUrl()) + '">Browse Diamonds</a></div></div>';
      return;
    }

    var cachedPreview =
      window.WscByor && window.WscByor.getPreviewDiamond
        ? window.WscByor.getPreviewDiamond(pid)
        : null;

    if (cachedPreview) {
      renderDetailView(cachedPreview, true);
    } else {
      root.innerHTML = '<div class="wsc-empty">Loading diamond details…</div>';
    }

    var apiBase = (cfg.appUrl || "").replace(/\/+$/, "");
    fetch(apiBase + "/api/diamonds?id=" + encodeURIComponent(pid))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.diamond) {
          if (!cachedPreview) {
            root.innerHTML =
              '<div class="wsc-empty"><h3>Diamond Not Found</h3><p>This stone may have been sold or removed.</p>' +
              '<div class="wsc-empty-links"><a class="wsc-btn-sm" href="' + esc(resolveBackUrl()) + '">Back to Diamonds</a></div></div>';
          }
          return;
        }
        renderDetailView(data.diamond, false);
      })
      .catch(function () {
        if (!cachedPreview) {
          root.innerHTML =
            '<div class="wsc-empty">Unable to load diamond details right now.</div>';
        }
      });
  }

  function renderGridCards(diamonds) {
    var selectedId = getSelectedDiamondId();
    return (
      '<div class="wsc-grid">' +
      diamonds
        .map(function (d) {
          var isSelected = Boolean(selectedId && String(d.id) === selectedId);
          return (
            '<article class="wsc-card' +
            (isSelected ? " wsc-card--selected" : "") +
            '" data-wsc-open="' +
            esc(d.id) +
            '">' +
            '<div class="wsc-card-media">' +
            (isSelected ? '<span class="wsc-selected-badge">✓ Selected</span>' : "") +
            (d.certificate ? '<span class="wsc-cert-badge">' + esc(d.certificate) + "</span>" : "") +
            (d.video ? '<span class="wsc-video-badge">360°</span>' : "") +
            renderStoneMediaHtml(d, "wsc-card-img", 64) +
            "</div>" +
            '<div class="wsc-card-body">' +
            '<h3 class="wsc-card-title">' + esc(d.title) + "</h3>" +
            '<div class="wsc-card-sub">' + esc([d.shape, d.category].filter(Boolean).join(" · ")) + "</div>" +
            '<div class="wsc-specs">' +
            '<div class="wsc-spec-item"><div class="wsc-spec-k">Carat</div><div class="wsc-spec-v">' + esc(d.carats ?? "—") + "</div></div>" +
            '<div class="wsc-spec-item"><div class="wsc-spec-k">Color</div><div class="wsc-spec-v">' + esc(d.colore || "—") + "</div></div>" +
            '<div class="wsc-spec-item"><div class="wsc-spec-k">Clarity</div><div class="wsc-spec-v">' + esc(d.clarity || "—") + "</div></div>" +
            '<div class="wsc-spec-item"><div class="wsc-spec-k">Cut</div><div class="wsc-spec-v">' + esc(d.cut || "—") + "</div></div>" +
            "</div>" +
            '<div class="wsc-card-foot">' +
            '<span class="wsc-price">' + esc(formatMoney(d.price)) + "</span>" +
            '<span class="wsc-btn-sm">View Diamond →</span>' +
            "</div></div></article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderListTable(diamonds) {
    var selectedId = getSelectedDiamondId();
    return (
      '<div class="wsc-table-wrap"><table class="wsc-table"><thead><tr>' +
      "<th>Diamond</th><th>Carat</th><th>Color</th><th>Clarity</th><th>Cut</th><th>Lab</th><th>Price</th><th></th>" +
      "</tr></thead><tbody>" +
      diamonds
        .map(function (d) {
          var isSelected = Boolean(selectedId && String(d.id) === selectedId);
          return (
            '<tr class="wsc-table-row' +
            (isSelected ? " wsc-table-row--selected" : "") +
            '" data-wsc-open="' +
            esc(d.id) +
            '">' +
            "<td>" +
            '<div class="wsc-table-stone">' +
            '<div class="wsc-table-thumb">' +
            renderStoneMediaHtml(d, "wsc-table-img", 26) +
            "</div>" +
            "<div>" +
            '<div class="wsc-table-name">' + esc(d.title || d.shape || "Diamond") + "</div>" +
            '<div class="wsc-table-meta">' +
            esc([d.shape, isSelected ? "Selected for Ring" : d.stockId ? "SKU " + d.stockId : ""].filter(Boolean).join(" · ")) +
            "</div></div></div></td>" +
            "<td>" + esc(d.carats != null ? d.carats + " ct" : "—") + "</td>" +
            "<td>" + esc(d.colore || "—") + "</td>" +
            "<td>" + esc(d.clarity || "—") + "</td>" +
            "<td>" + esc(d.cut || "—") + "</td>" +
            "<td>" + esc(d.certificate || "—") + "</td>" +
            '<td class="wsc-table-price">' + esc(formatMoney(d.price)) + "</td>" +
            '<td class="wsc-table-action"><button type="button" class="wsc-btn-sm">View &amp; Select →</button></td>' +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function renderListingPanel(data) {
    var viewEl = document.getElementById("wsc-view-panel");
    if (!viewEl) return;

    var diamonds = data.diamonds || [];
    var total = data.totalCount || 0;
    var totalPages = Math.max(1, Math.ceil(total / state.limit));

    var headerHtml =
      '<div class="wsc-view-bar">' +
      '<div class="wsc-results-meta">' +
      '<span class="wsc-count-pill">' + esc(total.toLocaleString()) + "</span>" +
      "<span>Diamonds Available</span>" +
      "</div>" +
      '<div class="wsc-view-tabs" role="tablist" aria-label="View Mode">' +
      '<button type="button" role="tab" class="wsc-view-tab' +
      (state.viewMode === "grid" ? " wsc-view-tab--active" : "") +
      '" data-wsc-view="grid">⊞ Grid View</button>' +
      '<button type="button" role="tab" class="wsc-view-tab' +
      (state.viewMode === "list" ? " wsc-view-tab--active" : "") +
      '" data-wsc-view="list">☰ List View</button>' +
      "</div></div>";

    var bodyHtml =
      diamonds.length === 0
        ? '<div class="wsc-empty"><h3>No Diamonds Found</h3><p>Try resetting or widening your filters to view matching stones.</p></div>'
        : state.viewMode === "list"
          ? renderListTable(diamonds)
          : renderGridCards(diamonds);

    var pagerHtml =
      totalPages > 1
        ? '<div class="wsc-pagination">' +
          '<button type="button" class="wsc-page-btn" data-wsc-page="' + (state.page - 1) + '"' + (state.page <= 1 ? " disabled" : "") + ">← Previous</button>" +
          '<span class="wsc-pagination-info">Page ' + state.page + " of " + totalPages + "</span>" +
          '<button type="button" class="wsc-page-btn" data-wsc-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? " disabled" : "") + ">Next →</button>" +
          "</div>"
        : "";

    viewEl.innerHTML = headerHtml + bodyHtml + pagerHtml;
    wireImageFallbacks(viewEl);

    var byId = new Map(
      diamonds.map(function (d) {
        return [String(d.id), d];
      })
    );

    viewEl.querySelectorAll("[data-wsc-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.viewMode = btn.getAttribute("data-wsc-view");
        saveCachedListState(state);
        renderListingPanel(data);
      });
    });

    viewEl.querySelectorAll("[data-wsc-open]").forEach(function (el) {
      el.addEventListener("click", function () {
        var stone = byId.get(String(el.getAttribute("data-wsc-open")));
        if (stone) goToDiamondDetail(stone);
      });
    });

    viewEl.querySelectorAll("[data-wsc-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = Number(btn.getAttribute("data-wsc-page"));
        if (p >= 1 && p <= totalPages) {
          state.page = p;
          saveCachedListState(state);
          fetchDiamonds();
          root.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function renderLoadingSkeleton() {
    var viewEl = document.getElementById("wsc-view-panel");
    if (!viewEl) return;
    var cards = "";
    for (var i = 0; i < 8; i += 1) {
      cards += '<div class="wsc-skeleton-card"></div>';
    }
    viewEl.innerHTML = '<div class="wsc-skeleton-grid">' + cards + "</div>";
  }

  function fetchDiamonds() {
    renderLoadingSkeleton();

    if (activeController) activeController.abort();
    activeController = new AbortController();

    var params = new URLSearchParams();
    if (cfg.shop) params.set("shop", cfg.shop);
    params.set("type", state.pageType);
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));
    params.set("sort", state.sort);
    [
      "shape",
      "cut",
      "color",
      "clarity",
      "certificate",
      "minCarat",
      "maxCarat",
      "minPrice",
      "maxPrice",
    ].forEach(function (k) {
      if (state[k]) params.set(k, String(state[k]));
    });

    var apiBase = (cfg.appUrl || "").replace(/\/+$/, "");
    fetch(apiBase + "/api/diamonds?" + params.toString(), { signal: activeController.signal })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        renderListingPanel(data);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        var viewEl = document.getElementById("wsc-view-panel");
        if (viewEl) {
          viewEl.innerHTML = '<div class="wsc-empty">Unable to load diamonds right now.</div>';
        }
      });
  }

  function loadListingPage() {
    if (
      cfg.enabledCategories &&
      cfg.pageType &&
      cfg.pageType !== "detail" &&
      cfg.enabledCategories[cfg.pageType] === false
    ) {
      var pages = cfg.pages || {};
      var alternatives = [
        { key: "natural", label: "Natural Diamonds" },
        { key: "lab", label: "Lab Grown Diamonds" },
        { key: "gemstones", label: "Gemstones" },
        { key: "colored", label: "Colored Diamonds" },
      ].filter(function (item) {
        return cfg.enabledCategories[item.key] !== false && Boolean(pages[item.key]);
      });

      root.innerHTML =
        '<div class="wsc-empty"><h3>Collection Hidden</h3>' +
        "<p>This diamond category is currently hidden from the storefront.</p>" +
        (alternatives.length
          ? '<div class="wsc-empty-links">' +
            alternatives
              .map(function (item) {
                return (
                  '<a class="wsc-btn-sm" href="' +
                  esc(pages[item.key]) +
                  '">' +
                  esc(item.label) +
                  "</a>"
                );
              })
              .join("") +
            "</div>"
          : "") +
        "</div>";
      return;
    }

    root.innerHTML = '<div id="wsc-filters-panel"></div><div id="wsc-view-panel"></div>';
    var filtersEl = document.getElementById("wsc-filters-panel");

    function updateAndReload(patch) {
      Object.assign(state, patch);
      saveCachedListState(state);
      Filters.renderFilterBar(filtersEl, state.pageType, state, updateAndReload, cfg);
      fetchDiamonds();
    }

    Filters.renderFilterBar(filtersEl, state.pageType, state, updateAndReload, cfg);
    fetchDiamonds();
  }

  window.addEventListener("wsc:byor-state-changed", function () {
    if (cfg.pageType === "detail") {
      loadDetailPage();
    }
  });

  if (cfg.pageType === "detail") {
    loadDetailPage();
  } else {
    loadListingPage();
  }
})();
