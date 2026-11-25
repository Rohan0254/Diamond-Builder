export const STOREFRONT_CATEGORY_OPTIONS = Object.freeze([
  { key: "natural", label: "Natural Diamonds" },
  { key: "lab", label: "Lab Grown Diamonds" },
  { key: "gemstones", label: "Gemstones" },
  { key: "colored", label: "Colored Diamonds" },
]);

export const DEFAULT_ENABLED_CATEGORIES = Object.freeze({
  natural: true,
  lab: true,
  gemstones: true,
  colored: true,
});

export function normalizeEnabledCategories(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    natural: src.natural !== false,
    lab: src.lab !== false,
    gemstones: src.gemstones !== false,
    colored: src.colored !== false,
  };
}
