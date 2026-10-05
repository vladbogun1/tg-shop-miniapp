/**
 * Guessing a product's brand from its texts — the site's fallback for schema.org `brand` when the
 * admin left `products.brand` empty, and the «предложить» hint in the admin product form.
 */

/**
 * Brands we actually sell, as they should be spelt. Matched as whole words in the product title;
 * the earliest match wins ("Кабелі Attack Shark & Mambasnake" → Attack Shark).
 */
export const KNOWN_BRANDS = [
  "Attack Shark",
  "ATK",
  "X-RayPad",
  "MCHOSE",
  "WestLab",
  "IPI",
  "AULA",
  "LEOBOG",
  "MadLions",
  "Zoepad",
  "QIANYING",
  "ZHENHUO",
  "LEIFU",
  "Mieyco",
  "ROCKBROS",
  "West Biking",
  "X-Tiger",
  "ESPTiger",
  "SIMGOT",
  "Proove",
  "VGN",
  "Scyrox",
  "Ajazz",
  "YUNZII",
  "RAPOO",
  "Mambasnake",
  "IROK",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${KNOWN_BRANDS.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu");
const BRAND_LINE_RE = /^[\s•*-]*(?:Бренд|Brand|Виробник|Производитель|Manufacturer)\s*:\s*([^\n]+)$/imu;

/**
 * The product's brand, or null when it cannot be told (then schema.org gets no `brand` at all —
 * better than a wrong one). Source, in order: a "Бренд: …" line in the description (that is where
 * the descriptions keep characteristics), then a known brand name in the title.
 */
export function guessProductBrand(p: { title: string; description?: string | null }): string | null {
  const line = (p.description ?? "").match(BRAND_LINE_RE);
  if (line) {
    const value = line[1].trim().replace(/[.;,]+$/, "");
    if (value && value.length <= 40) {
      const known = KNOWN_BRANDS.find((b) => b.toLowerCase() === value.toLowerCase());
      return known ?? value;
    }
  }
  let best: { index: number; name: string } | null = null;
  for (const m of p.title.matchAll(BRAND_RE)) {
    if (!best || m.index < best.index) {
      best = { index: m.index, name: KNOWN_BRANDS.find((b) => b.toLowerCase() === m[1].toLowerCase()) ?? m[1] };
    }
  }
  return best?.name ?? null;
}
