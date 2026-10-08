import "./mascot.css";

/**
 * Home category tiles: a pixel character doing the category's thing, in a fixed 48×40 art-px slot
 * (×2 = 96×80 css) at the tile's bottom-right. Rest = frame 0; hover / keyboard focus plays the
 * 4-frame strip once (mascot.css §3, frame timings from the generator manifest, baked into PLAY_MS and the keyframes); touch = still.
 * Categories are tags the owner creates in the admin, so the art is picked by fuzzy slug/name
 * matching and anything unknown gets the mouse flick.
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

/** Length of each strip's one-shot, ms (sum of the manifest frame times). */
const PLAY_MS: Record<CategoryKind, number> = { mouse: 600, glides: 700, mousepad: 600, glass: 700, mechanical: 500, magnetic: 600, keycaps: 700, headset: 700, cable: 700, sleeve: 700, blower: 700, chair: 700, desk: 700, sale: 700 };

export function CategorySprite({ slug, name }: { slug: string; name?: string }) {
  const kind = categoryKind(slug, name);
  return (
    <span
      aria-hidden
      className="mx-cat"
      style={
        {
          backgroundImage: `url(/mascot/cats/${kind}.png)`,
          "--an": `mx-cat-${kind}`,
          "--ad": `${PLAY_MS[kind]}ms`,
        } as React.CSSProperties
      }
    />
  );
}
