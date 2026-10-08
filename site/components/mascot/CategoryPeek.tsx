import { categoryArtKind } from "@/components/home/CategoryArt";
import { SPRITES, Spr, type SpriteName } from "./Sprite";

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Which character peeks out of a home category tile — same fuzzy match as CategoryArt. */
const CATEGORY_SPRITE: Record<ReturnType<typeof categoryArtKind>, SpriteName> = {
  mouse: "devices", // the mascot inspects a mouse through a magnifier
  glides: "devices",
  mechanical: "setup", // the robot tinkering with hardware
  magnetic: "setup",
  keycaps: "setup",
  desk: "setup",
  headset: "twitch", // headphones on, at the mic
  mousepad: "cfg", // aiming: the pad is where the flicks happen
  glass: "cfg",
  sale: "don_ua", // the coin-heart: a good price
  blower: "tg", // air → the paper plane
  cable: "youtube",
  sleeve: "hero_wave", // a sleeve on the waving arm
  chair: "discord",
  box: "hero_wave",
};

export function categorySprite(slug: string, name = ""): SpriteName {
  return CATEGORY_SPRITE[categoryArtKind(slug, name)] ?? "hero_wave";
}

/** The tile's character, hidden behind the right edge until hover/focus (tile must be `.group`, overflow hidden). */
export function CategoryPeek({ slug, name }: { slug: string; name?: string }) {
  const sprite = categorySprite(slug, name);
  const [w] = SPRITES[sprite];
  // how much stays behind the edge when it peeks: about a third
  const peek = Math.round(w * 0.3);
  return (
    <span aria-hidden className="mx-peek" style={{ "--w": w, "--peek": peek } as Vars}>
      <Spr name={sprite} lazy />
    </span>
  );
}
