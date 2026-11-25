(function () {
  var SHAPE_SVGS = {
    Round: '<circle cx="12" cy="12" r="8.5"/><polygon points="12,5.5 16.5,7.5 18.5,12 16.5,16.5 12,18.5 7.5,16.5 5.5,12 7.5,7.5"/>',
    Oval: '<ellipse cx="12" cy="12" rx="6.5" ry="9.5"/><ellipse cx="12" cy="12" rx="3.5" ry="5.5"/>',
    Emerald: '<polygon points="7,3.5 17,3.5 19.5,6 19.5,18 17,20.5 7,20.5 4.5,18 4.5,6"/><rect x="7.5" y="7" width="9" height="10"/>',
    Princess: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><line x1="4.5" y1="4.5" x2="19.5" y2="19.5"/><line x1="19.5" y1="4.5" x2="4.5" y2="19.5"/>',
    Cushion: '<rect x="4.5" y="4.5" width="15" height="15" rx="4.5"/><rect x="8" y="8" width="8" height="8" rx="2"/>',
    Pear: '<path d="M12 2.5 C16.5 8.5 18.5 13 18.5 15.5 A6.5 6.5 0 1 1 5.5 15.5 C5.5 13 7.5 8.5 12 2.5 Z"/>',
    Radiant: '<polygon points="7,3.5 17,3.5 19.5,6.5 19.5,17.5 17,20.5 7,20.5 4.5,17.5 4.5,6.5"/>',
    Asscher: '<polygon points="8,3.5 16,3.5 20.5,8 20.5,16 16,20.5 8,20.5 3.5,16 3.5,8"/><polygon points="9.5,7.5 14.5,7.5 16.5,9.5 16.5,14.5 14.5,16.5 9.5,16.5 7.5,14.5 7.5,9.5"/>',
    Marquise: '<path d="M12 2.5 Q19.5 12 12 21.5 Q4.5 12 12 2.5 Z"/>',
    Heart: '<path d="M12 20.5 C5.5 15 3.5 11 3.5 7.8 A4.2 4.2 0 0 1 12 6 A4.2 4.2 0 0 1 20.5 7.8 C20.5 11 18.5 15 12 20.5 Z"/>',
  };

  var COMMON_SHAPES = [
    "Round",
    "Oval",
    "Emerald",
    "Princess",
    "Cushion",
    "Pear",
    "Radiant",
    "Asscher",
    "Marquise",
    "Heart",
  ];

  // All 4 diamond page filter configurations maintained cleanly in one place.
  var CATEGORY_CONFIGS = {
    natural: {
      title: "Natural Diamonds",
      subtitle: "Explore certified earth-mined stones ready for your ring.",
      shapes: COMMON_SHAPES,
      filters: [
        { key: "cut", label: "Cut", options: ["Ideal", "Excellent", "Very Good", "Good"] },
        { key: "color", label: "Color", options: ["D", "E", "F", "G", "H", "I", "J", "K"] },
        { key: "clarity", label: "Clarity", options: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2"] },
        { key: "certificate", label: "Lab", options: ["GIA", "IGI", "AGS", "GCAL"] },
      ],
    },
    lab: {
      title: "Lab Grown Diamonds",
      subtitle: "Brilliant ethical stones with verified lab grading.",
      shapes: COMMON_SHAPES,
      filters: [
        { key: "cut", label: "Cut", options: ["Ideal", "Excellent", "Very Good"] },
        { key: "color", label: "Color", options: ["D", "E", "F", "G", "H", "I"] },
        { key: "clarity", label: "Clarity", options: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1"] },
        { key: "certificate", label: "Lab", options: ["IGI", "GIA", "GCAL"] },
      ],
    },
    gemstones: {
      title: "Gemstones",
      subtitle: "Sapphire, emerald, ruby, and fine colored stones.",
      shapes: COMMON_SHAPES,
      filters: [
        { key: "color", label: "Gemstone Color", options: ["Blue", "Pink", "Green", "Red", "Yellow", "Purple", "Peach"] },
        { key: "clarity", label: "Clarity", options: ["IF", "VVS1", "VVS2", "VS1", "VS2", "Eye Clean"] },
      ],
    },
    colored: {
      title: "Colored Diamonds",
      subtitle: "Fancy yellow, pink, blue, and rare colored diamonds.",
      shapes: COMMON_SHAPES,
      filters: [
        { key: "color", label: "Fancy Color", options: ["Yellow", "Pink", "Blue", "Green", "Brown", "Orange", "Grey"] },
        { key: "clarity", label: "Clarity", options: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1"] },
        { key: "certificate", label: "Lab", options: ["GIA", "IGI"] },
      ],
    },
  };

  function getShapeSvg(shape, size) {
    var s = size || 24;
    var inner = SHAPE_SVGS[shape] || SHAPE_SVGS.Round;
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
      inner +
      "</svg>"
    );
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCategoryTabs(pageType, cfg) {
    var pages = (cfg && cfg.pages) || {};
    var enabled = (cfg && cfg.enabledCategories) || {};
    var order = ["natural", "lab", "gemstones", "colored"];
    var links = order
      .filter(function (key) {
        return enabled[key] !== false && Boolean(pages[key]);
      })
      .map(function (key) {
        var meta = CATEGORY_CONFIGS[key];
        var active = key === pageType;
        return (
          '<a class="wsc-cat-tab' +
          (active ? " wsc-cat-tab--active" : "") +
          '" href="' +
          esc(pages[key]) +
          '">' +
          esc(meta.title) +
          "</a>"
        );
      });

    if (links.length <= 1) return "";
    return '<div class="wsc-cat-tabs" role="navigation" aria-label="Diamond Categories">' + links.join("") + "</div>";
  }

  function renderFilterBar(container, pageType, state, onChange, cfg) {
    if (!container) return;
    var config = CATEGORY_CONFIGS[pageType] || CATEGORY_CONFIGS.natural;
    var catTabsHtml = renderCategoryTabs(pageType, cfg);

    var shapesHtml = config.shapes
      .map(function (shape) {
        var active = state.shape === shape;
        return (
          '<button type="button" class="wsc-shape-btn' +
          (active ? " wsc-shape-btn--active" : "") +
          '" data-wsc-shape="' +
          esc(shape) +
          '">' +
          '<span class="wsc-shape-icon">' + getShapeSvg(shape, 24) + "</span>" +
          '<span class="wsc-shape-name">' + esc(shape) + "</span>" +
          "</button>"
        );
      })
      .join("");

    var dropdownsHtml = config.filters
      .map(function (f) {
        var opts = f.options
          .map(function (opt) {
            var sel = state[f.key] === opt ? " selected" : "";
            return '<option value="' + esc(opt) + '"' + sel + ">" + esc(opt) + "</option>";
          })
          .join("");
        return (
          '<div class="wsc-filter-field">' +
          '<label class="wsc-filter-label" for="wsc-f-' + esc(f.key) + '">' + esc(f.label) + "</label>" +
          '<select id="wsc-f-' + esc(f.key) + '" class="wsc-select" data-wsc-filter="' + esc(f.key) + '">' +
          '<option value="">All ' + esc(f.label) + "</option>" +
          opts +
          "</select></div>"
        );
      })
      .join("");

    container.innerHTML =
      catTabsHtml +
      '<div class="wsc-filter-wrap">' +
      '<div class="wsc-filter-head">' +
      "<div>" +
      '<h2 class="wsc-filter-title">Filter ' + esc(config.title) + "</h2>" +
      '<p class="wsc-filter-subtitle">' + esc(config.subtitle) + "</p>" +
      "</div>" +
      '<button type="button" class="wsc-page-btn" data-wsc-reset="1">Reset Filters</button>' +
      "</div>" +
      '<div class="wsc-shapes">' + shapesHtml + "</div>" +
      '<div class="wsc-filter-grid">' +
      dropdownsHtml +
      '<div class="wsc-filter-field">' +
      '<label class="wsc-filter-label" for="wsc-f-minCarat">Carat Weight</label>' +
      '<div class="wsc-range-row">' +
      '<input id="wsc-f-minCarat" type="number" step="0.1" min="0" class="wsc-input" data-wsc-filter="minCarat" value="' + esc(state.minCarat || "") + '" placeholder="Min ct">' +
      '<input id="wsc-f-maxCarat" type="number" step="0.1" min="0" class="wsc-input" data-wsc-filter="maxCarat" value="' + esc(state.maxCarat || "") + '" placeholder="Max ct">' +
      "</div></div>" +
      '<div class="wsc-filter-field">' +
      '<label class="wsc-filter-label" for="wsc-f-minPrice">Price Range ($)</label>' +
      '<div class="wsc-range-row">' +
      '<input id="wsc-f-minPrice" type="number" min="0" class="wsc-input" data-wsc-filter="minPrice" value="' + esc(state.minPrice || "") + '" placeholder="Min $">' +
      '<input id="wsc-f-maxPrice" type="number" min="0" class="wsc-input" data-wsc-filter="maxPrice" value="' + esc(state.maxPrice || "") + '" placeholder="Max $">' +
      "</div></div>" +
      '<div class="wsc-filter-field">' +
      '<label class="wsc-filter-label" for="wsc-f-sort">Sort By</label>' +
      '<select id="wsc-f-sort" class="wsc-select" data-wsc-filter="sort">' +
      '<option value="price_asc"' + (state.sort === "price_asc" ? " selected" : "") + ">Price: Low to High</option>" +
      '<option value="price_desc"' + (state.sort === "price_desc" ? " selected" : "") + ">Price: High to Low</option>" +
      '<option value="carat_desc"' + (state.sort === "carat_desc" ? " selected" : "") + ">Carat: High to Low</option>" +
      '<option value="carat_asc"' + (state.sort === "carat_asc" ? " selected" : "") + ">Carat: Low to High</option>" +
      "</select></div></div></div>";

    container.querySelectorAll("[data-wsc-shape]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var s = btn.getAttribute("data-wsc-shape");
        onChange({ shape: state.shape === s ? "" : s, page: 1 });
      });
    });

    container.querySelectorAll("[data-wsc-filter]").forEach(function (el) {
      el.addEventListener("change", function () {
        var patch = { page: 1 };
        patch[el.getAttribute("data-wsc-filter")] = el.value;
        onChange(patch);
      });
    });

    container.querySelector("[data-wsc-reset]").addEventListener("click", function () {
      onChange({
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
      });
    });
  }

  window.WscDiamondFilters = {
    CATEGORY_CONFIGS: CATEGORY_CONFIGS,
    getShapeSvg: getShapeSvg,
    renderFilterBar: renderFilterBar,
  };
})();
