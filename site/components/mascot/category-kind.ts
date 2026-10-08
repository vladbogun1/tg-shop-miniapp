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
