export function diamondTitle(diamond) {
  const carats = diamond.carats == null
    ? ""
    : `${diamond.carats.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 3 })}ct`;
  const shape = diamond.shape
    ? diamond.shape.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "";
  const category = diamond.vendor?.category;
  let descriptor = "Diamond";
  if (category === "Lab Grown Natural" || category === "Lab Grown Colored") descriptor = "Lab Grown Diamond";
  else if (category === "Natural") descriptor = "Natural Diamond";
  else if (category === "Gemstones") {
    const color = diamond.colore?.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
    descriptor = `${color || "Gemstone"} Diamond`;
  } else if (category === "Colored Diamonds") descriptor = "fancy Colored Diamond";
  return [carats, shape, descriptor].filter(Boolean).join(" ");
}
