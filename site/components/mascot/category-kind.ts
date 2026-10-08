/**
 * Which device/character art a home category gets. Categories are tags the owner creates in the
 * admin, so the art is picked by fuzzy slug/name matching and anything unknown gets the mouse.
 */

export const CATEGORY_KINDS = ["mouse", "glides", "mousepad", "glass", "mechanical", "magnetic", "keycaps", "headset", "cable", "sleeve", "blower", "chair", "desk", "sale"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Ordered: the first rule whose any keyword appears in the slug or name wins. */
const RULES: [CategoryKind, string[]][] = [
  ["glass", ["steklyan", "steklan", "glass", "скло", "скля", "стекл"]],
  ["glides", ["glayd", "glaid", "glide", "skate", "глайд"]],
  ["blower", ["duyk", "duik", "blower", "duster", "дуйк", "воздуходув", "повітродув"]],
  ["cable", ["kabel", "cable", "кабел", "провод", "дрот"]],
  ["keycaps", ["keykap", "keycap", "keikap", "кейкап"]],
  ["magnetic", ["magnit", "magnet", "hall", "магніт", "магнит"]],
  ["mechanical", ["mekh", "meh", "mech", "klv", "klav", "keyboard", "клав", "механ"]],
  ["mousepad", ["kovr", "kovrik", "pad", "mousemat", "килим", "ковр"]],
  ["chair", ["kresl", "chair", "крісл", "кресл"]],
  ["headset", ["naush", "headph", "headset", "навушн", "наушн", "гарнітур", "гарнитур"]],
  ["mouse", ["mysh", "mish", "mouse", "mice", "миш", "мыш"]],
  ["sleeve", ["rukav", "sleeve", "рукав"]],
  ["desk", ["stol", "desk", "table", "стіл", "стол"]],
  ["sale", ["utsen", "ucen", "sale", "discount", "outlet", "уцін", "уцен", "знижк", "скидк"]],
];

export function categoryKind(slug: string, name = ""): CategoryKind {
  const hay = `${slug} ${name}`.toLowerCase();
  for (const [kind, words] of RULES) {
    if (words.some((w) => hay.includes(w))) return kind;
  }
  return "mouse";
}

/**
 * Catalog v2 `artKind` (docs/CATALOG-SPECS.md §1: mouse|keyboard|keycaps|pad|glass|glides|headphones|
 * iem|soundcard|sleeve|cable|blower|chair|desk|sale) → the art we actually have. The contract's
 * names differ from the asset names for a few kinds; kinds without their own art borrow the closest.
 */
const ART_KIND_ALIASES: Record<string, CategoryKind> = {
  keyboard: "mechanical",
  pad: "mousepad",
  headphones: "headset",
  iem: "headset",
  soundcard: "headset",
};

/** Art for a category: its admin `artKind` when set (and known), else the slug/name guess. */
export function artKindOf(artKind: string | null | undefined, slug: string, name = ""): CategoryKind {
  const k = artKind?.trim().toLowerCase();
  if (k) {
    // A keyboard root/leaf: keep the magnetic art for magnetic keyboards.
    if (k === "keyboard") return categoryKind(slug, name) === "magnetic" ? "magnetic" : "mechanical";
    if ((CATEGORY_KINDS as readonly string[]).includes(k)) return k as CategoryKind;
    if (ART_KIND_ALIASES[k]) return ART_KIND_ALIASES[k];
  }
  return categoryKind(slug, name);
}
