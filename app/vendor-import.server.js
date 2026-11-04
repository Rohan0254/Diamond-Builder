import prisma from "./db.server";

const MAX_FEED_BYTES = 25 * 1024 * 1024;
const BATCH_SIZE = 300;
const CERTIFICATE_VALUES = {
  GIA: "GIA", "GIA GEMOLOGIST": "GIA", G: "GIA", AGS: "AGS", A: "AGS", IGI: "IGI", I: "IGI", GCAL: "GCAL", ANCHORCERT: "AnchorCert", "-": "",
};
const CULET_VALUES = {
  POINTED: "Pointed", P: "Pointed", PO: "Pointed", NON: "None", NONE: "None", N: "None", MEDIUM: "Medium", M: "Medium",
  "VERY SMALL": "Very small", VS: "Very small", VSM: "Very small", SMALL: "Small", S: "Small", SML: "Small", LARGE: "Large", L: "Large", "NONE POINTED": "None Pointed", "-": "None",
};
const QUALITY_VALUES = {
  IDEAL: "Ideal", ID: "Ideal", I: "Ideal", "EX+": "Ideal", EXCELLENT: "Excellent", X: "Excellent", EX: "Excellent", "EXC NR": "Excellent",
  "VERY GOOD": "Very Good", VG: "Very Good", GOOD: "Good", G: "Good", GD: "Good", "FAIR TO GOOD": "Fair to Good", "F-G": "Fair to Good", FAIR: "Fair", F: "Fair", FR: "Fair", POOR: "Poor", P: "Poor", "-": "",
};
const COLOR_VALUES = { "PALE PEACH": "PEACH", GRAY: "GREY", VIOLET: "PURPLE" };
const SHAPE_VALUES = {
  B: "Round", BR: "Round", RB: "Round", ROUND: "Round", RD: "Round", RBC: "Round", RN: "Round", "BRILLIANT ROUND": "Round",
  P: "Pear", PS: "Pear", PE: "Pear", PEAR: "Pear", "PEAR STARBRITE": "Pear", KITE: "Pear",
  E: "Emerald", EM: "Emerald", EMERALD: "Emerald", EC: "Emerald", SQEM: "Emerald", AC: "Emerald", BAG: "Emerald", BG: "Emerald",
  BAGUETTE: "Baguette", M: "Marquise", MQ: "Marquise", MARQUISE: "Marquise", O: "Oval", OV: "Oval", OVAL: "Oval", "OVAL ROSE": "Oval",
  R: "Radiant", RAD: "Radiant", RA: "Radiant", RC: "Radiant", LR: "Radiant", RADIANT: "Radiant", FL: "Radiant", FLANDERS: "Radiant", FC: "Radiant", HEXAGONAL: "Radiant", OCTAGONAL: "Radiant", RECTANGULAR: "Radiant",
  PRN: "Princess", PR: "Princess", PRIN: "Princess", PRINCESS: "Princess", PN: "Princess", PC: "Princess", H: "Heart", HS: "Heart", HE: "Heart", HEART: "Heart",
  TRIL: "Trilliant", TRILL: "Trilliant", TRL: "Trilliant", TRILLIANT: "Trilliant", TRIANGULAR: "Triangular",
  C: "Cushion", CUS: "Cushion", CUSHION: "Cushion", "CUSHION BRILLIANT": "Cushion", CU: "Cushion", CB: "Cushion", CMB: "Cushion", CUSB: "Cushion", "CUSHION MODIFIED": "Cushion", OM: "Cushion", "OLD MINER": "Cushion",
  AS: "Asscher", ASS: "Asscher", ASSCHER: "Asscher", A: "Asscher", "EUROPEAN CUT": "European", EUROPEAN: "European", EU: "European",
  T: "Other", TR: "Other", TRIB: "Other", K: "Other", KT: "Other", S: "Other", STAR: "Other", ST: "Other", HM: "Other", HMB: "Other", "HALF MOON": "Other", TP: "Other", TRAP: "Other", TRAPB: "Other", TZ: "Other", TRAPEZOID: "Other", BU: "Other", BULLETS: "Other", OT: "Other", X: "Other", OTHER: "Other",
  SQUARE: "Square", "-": "",
};
const FLUORESCENCE_VALUES = {
  FAINT: "Faint", FNT: "Faint", F: "Faint", MEDIUM: "Medium", MED: "Medium", M: "Medium", NONE: "None", NON: "None", N: "None",
  STRONG: "Strong", STR: "Strong", STG: "Strong", S: "Strong", VS: "Very Strong", VSL: "Very Strong", VST: "Very Strong", SL: "Very Strong", "V.STR": "Very Strong", "VERY STRONG": "Very Strong",
  "MEDIUM STRONG": "Medium Strong", "MED-STG": "Medium Strong", "FNT-MED": "Faint Medium", SLIGHT: "Slight", "VERY SLIGHT": "Very Slight", "-": "None",
};
const FIELD_NORMALIZERS = {
  shape: normalizeShape, colore: normalizeColor, cut: normalizeQuality, pol: normalizeQuality, symm: normalizeQuality,
  flo: normalizeFluorescence, culet: normalizeCulet, certificate: normalizeCertificate,
};
const FIELD_ALIASES = { colore: ["colore", "col"], clarity: ["clarity", "clar"], certificate: ["certificate", "lab"] };

function parseCsv(text) {
  const records = [];
  let record = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ",") { record.push(value.trim()); value = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(value.trim()); value = "";
      if (record.some((cell) => cell !== "")) records.push(record);
      record = [];
    } else value += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (value || record.length) { record.push(value.trim()); records.push(record); }
  return records;
}

function numberOrNull(value) {
  if (value == null || value.trim() === "") return null;
  const number = Number(value.replaceAll(",", "").replace(/^\$/, ""));
  return Number.isFinite(number) ? number : null;
}

function capitalizeWords(value) {
  return value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedValue(value, mappings, fallback = capitalizeWords) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = mappings[trimmed.toUpperCase()];
  const result = normalized === undefined ? fallback(trimmed) : normalized;
  return result || null;
}

function normalizeCertificate(value) {
  return normalizedValue(value, CERTIFICATE_VALUES, (trimmed) => trimmed.toUpperCase());
}

function normalizeCulet(value) {
  return normalizedValue(value, CULET_VALUES);
}

function normalizeQuality(value) {
  return normalizedValue(value, QUALITY_VALUES);
}

function normalizeColor(value) {
  return normalizedValue(value, COLOR_VALUES, (trimmed) => trimmed);
}

function normalizeShape(value) {
  return normalizedValue(value, SHAPE_VALUES);
}

function normalizeFluorescence(value) {
  return normalizedValue(value, FLUORESCENCE_VALUES);
}

function mapDiamond(headers, cells, vendorId, sample, timestamp) {
  const values = Object.fromEntries(headers.map((header, index) => [header.toLowerCase().replace(/[\s_-]/g, ""), cells[index] ?? ""]));
  const get = (key) => values[key.toLowerCase().replace(/[\s_-]/g, "")] ?? "";
  const getFirst = (...keys) => keys.map(get).find((value) => value !== "") ?? "";
  const measurement = get("Measurement").split(/[x×*]/i).map((part) => numberOrNull(part));
  const diamond = { vendorId, stockId: get("stockId"), sample, status: 0, createdAt: timestamp, updatedAt: timestamp };
  if (!diamond.stockId) throw new Error("A CSV row is missing stockId.");
  for (const key of ["ReportNo", "shape", "colore", "clarity", "cut", "pol", "symm", "flo", "culet", "certificate", "girdle", "eyeClean", "video", "image", "pdf", "mineOfOrigin"]) {
    const value = get(key);
    const mappedValue = (FIELD_ALIASES[key] ? getFirst(...FIELD_ALIASES[key]) : value).trim();
    diamond[key] = FIELD_NORMALIZERS[key] ? FIELD_NORMALIZERS[key](mappedValue) : mappedValue || null;
  }
  for (const key of ["carats", "depth", "table", "price"]) diamond[key] = numberOrNull(get(key));
  diamond.maxDeliveryDays = numberOrNull(get("maxDeliveryDays"));
  const hasSeparateMeasurements = ["length", "width", "height"].every((key) => get(key) !== "");
  [diamond.length, diamond.width, diamond.height] = hasSeparateMeasurements
    ? ["length", "width", "height"].map((key) => numberOrNull(get(key)))
    : measurement.length === 3 ? measurement : [null, null, null];
  diamond.measurement = [diamond.length, diamond.width, diamond.height].every(Number.isFinite)
    ? [diamond.length, diamond.width, diamond.height].join(" * ")
    : null;
  diamond.lwRatio = diamond.length !== null && diamond.width > 0
    ? Number((diamond.length / diamond.width).toFixed(4))
    : null;
  return diamond;
}

export async function importVendorCsv(vendorId, importId, feedUrl, sample = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const url = new URL(feedUrl);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Feed URL must use HTTP or HTTPS.");
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) { finished = true; continue; }
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) throw new Error("CSV exceeds the 25 MB import limit.");
      chunks.push(value);
    }
    const csv = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    const records = parseCsv(csv);
    const headers = (records.shift() ?? []).map((header) => header.trim().replace(/^\uFEFF/, ""));
    const normalized = new Set(headers.map((header) => header.toLowerCase().replace(/[\s_-]/g, "")));
    if (!normalized.has("stockid")) throw new Error("CSV is missing the stockId column.");
    if (!records.length) throw new Error("CSV contains no diamond rows.");
    let imported = 0;
    for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
      const timestamp = new Date();
      const batch = records.slice(offset, offset + BATCH_SIZE).map((cells) => mapDiamond(headers, cells, vendorId, sample, timestamp));
      await prisma.diamond.createMany({ data: batch });
      imported += batch.length;
      await prisma.diamondImport.update({ where: { id: importId }, data: { imported } });
    }
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.diamond.updateMany({ where: { vendorId, status: 1 }, data: { status: 2, updatedAt: completedAt } }),
      prisma.diamond.updateMany({ where: { vendorId, status: 0 }, data: { status: 1, updatedAt: completedAt } }),
      prisma.vendor.update({ where: { id: vendorId }, data: { diamondCount: imported, lastImportAt: completedAt } }),
      prisma.diamondImport.update({ where: { id: importId }, data: { status: "COMPLETE", completedAt } }),
      prisma.diamond.deleteMany({ where: { vendorId, status: 2 } }),
    ]);
  } catch (error) {
    await prisma.diamond.deleteMany({ where: { vendorId, status: 0 } }).catch(() => {});
    await prisma.diamondImport.update({ where: { id: importId }, data: { status: "FAILED", error: error.message.slice(0, 500), completedAt: new Date() } }).catch(() => {});
  } finally {
    clearTimeout(timeout);
  }
}
