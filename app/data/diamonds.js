import prisma from "../db.server.js";
import { diamondTitle } from "../features/diamonds/diamond-title.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const PAGE_TYPE_CATEGORIES = Object.freeze({
  natural: ["Natural"],
  lab: ["Lab Grown Natural", "Lab Grown Colored"],
  gemstones: ["Gemstones"],
  colored: ["Colored Diamonds"],
});

function resolveCategories({ pageType, category }) {
  if (pageType && PAGE_TYPE_CATEGORIES[pageType]) {
    return PAGE_TYPE_CATEGORIES[pageType];
  }
  if (category) return [category];
  return PAGE_TYPE_CATEGORIES.natural;
}

/**
 * Bounded, indexed diamond query shared by `/api/diamonds` and `/embed/diamonds`.
 */
export async function queryDiamonds({
  pageType = "natural",
  category = "",
  shape = "",
  cut = "",
  color = "",
  clarity = "",
  certificate = "",
  minPrice = 0,
  maxPrice = 0,
  minCarat = 0,
  maxCarat = 0,
  sort = "price_asc",
  page = 1,
  pageSize = 12,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(24, Math.max(1, Number(pageSize) || 12));
  const categories = resolveCategories({ pageType, category });

  const vendors = await prisma.vendor.findMany({
    where: { category: { in: categories }, enabled: true },
    select: { id: true, name: true, category: true },
    take: 200,
  });

  const vendorIds = vendors.map((v) => v.id);
  if (!vendorIds.length) {
    return { diamonds: [], totalCount: 0, page: safePage, pageSize: safeLimit };
  }

  const where = {
    vendorId: { in: vendorIds },
    status: 1,
  };

  if (shape) where.shape = shape;
  if (cut) where.cut = cut;
  if (color) where.colore = color;
  if (clarity) where.clarity = clarity;
  if (certificate) where.certificate = certificate;

  if (minCarat > 0 || maxCarat > 0) {
    where.carats = {};
    if (minCarat > 0) where.carats.gte = Number(minCarat);
    if (maxCarat > 0) where.carats.lte = Number(maxCarat);
  }

  if (minPrice > 0 || maxPrice > 0) {
    where.price = {};
    if (minPrice > 0) where.price.gte = Number(minPrice);
    if (maxPrice > 0) where.price.lte = Number(maxPrice);
  }

  let orderBy = [{ price: "asc" }, { id: "asc" }];
  if (sort === "price_desc") orderBy = [{ price: "desc" }, { id: "desc" }];
  else if (sort === "carat_desc") orderBy = [{ carats: "desc" }, { id: "desc" }];
  else if (sort === "carat_asc") orderBy = [{ carats: "asc" }, { id: "asc" }];
  else if (sort === "newest") orderBy = [{ updatedAt: "desc" }, { id: "desc" }];

  const [rows, totalCount] = await Promise.all([
    prisma.diamond.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      select: {
        id: true,
        vendorId: true,
        stockId: true,
        ReportNo: true,
        shape: true,
        carats: true,
        colore: true,
        clarity: true,
        cut: true,
        pol: true,
        symm: true,
        flo: true,
        price: true,
        certificate: true,
        image: true,
        video: true,
        pdf: true,
        measurement: true,
        lwRatio: true,
        depth: true,
        table: true,
      },
    }),
    prisma.diamond.count({ where }),
  ]);

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const diamonds = rows.map((row) => {
    const vendor = vendorById.get(row.vendorId);
    return {
      ...row,
      category: vendor?.category ?? categories[0],
      title: diamondTitle({ ...row, vendor }),
    };
  });

  return { diamonds, totalCount, page: safePage, pageSize: safeLimit };
}

/** Fetches a single active diamond by Mongo ObjectId. */
export async function getDiamondById(id) {
  if (!id || !OBJECT_ID.test(id)) return null;

  const row = await prisma.diamond.findFirst({
    where: { id, status: 1 },
    select: {
      id: true,
      vendorId: true,
      stockId: true,
      ReportNo: true,
      shape: true,
      carats: true,
      colore: true,
      clarity: true,
      cut: true,
      pol: true,
      symm: true,
      flo: true,
      length: true,
      width: true,
      height: true,
      measurement: true,
      lwRatio: true,
      depth: true,
      table: true,
      culet: true,
      certificate: true,
      girdle: true,
      eyeClean: true,
      price: true,
      video: true,
      image: true,
      pdf: true,
      mineOfOrigin: true,
      maxDeliveryDays: true,
    },
  });

  if (!row) return null;
  const vendor = await prisma.vendor.findUnique({
    where: { id: row.vendorId },
    select: { id: true, name: true, category: true },
  });

  return {
    ...row,
    category: vendor?.category ?? "Natural",
    title: diamondTitle({ ...row, vendor }),
  };
}

/** Fast summary counts per variety for the Merchant Dashboard. */
export async function getDiamondSummaryCounts() {
  const vendors = await prisma.vendor.findMany({
    where: { enabled: true },
    select: { category: true, diamondCount: true },
    take: 250,
  });

  const totals = { natural: 0, lab: 0, gemstones: 0, colored: 0, all: 0 };
  for (const v of vendors) {
    const n = Number(v.diamondCount) || 0;
    totals.all += n;
    if (v.category === "Natural") totals.natural += n;
    else if (v.category === "Lab Grown Natural" || v.category === "Lab Grown Colored") totals.lab += n;
    else if (v.category === "Gemstones") totals.gemstones += n;
    else if (v.category === "Colored Diamonds") totals.colored += n;
  }
  return totals;
}
