import "./mascot.css";

/**
 * Pixel mascot sprites (maxsolch «21» + the ChiSetup robots), served from /public/mascot.
 * 1 art pixel = 1 px in the PNG; on screen every sprite is drawn at a WHOLE multiple set by the
 * nearest ancestor's `--px` (CSS custom property, unitless). Sizes are art px × --px, see mascot.css.
 * Everything here is decorative: aria-hidden, alt="", no pointer events.
 */

/** [width, height, frames] in art pixels — mascot-pack/sprites/manifest.json (+ `box` cut from the props sheet). */
export const SPRITES = {
  hero_wave: [66, 56, 1],
  hero_blink: [59, 56, 1],
  devices: [66, 56, 1],
  setup: [69, 56, 1],
  twitch: [65, 56, 1],
  cfg: [96, 56, 1],
  don_ua: [58, 56, 1],
  tg: [79, 56, 1],
  youtube: [50, 56, 1],
  discord: [67, 56, 1],
  dm: [62, 56, 1],
  hauler_box: [73, 56, 1],
  kick: [78, 56, 1],
  qblock: [21, 20, 1],
  qblock_hit: [19, 20, 1],
  box: [30, 27, 1],
  coin: [12, 12, 2],
  spark: [39, 36, 5],
  sweeper: [50, 25, 2],
  hauler: [85, 65, 3],
} as const;

export type SpriteName = keyof typeof SPRITES;

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

function vars(name: SpriteName, extra?: Vars): Vars {
  const [w, h, n] = SPRITES[name];
  return { "--w": w, "--h": h, "--n": n, ...extra };
}

/** A single-frame sprite. */
export function Spr({
  name,
  className = "",
  lazy = false,
  style,
}: {
  name: SpriteName;
  className?: string;
  lazy?: boolean;
  style?: Vars;
}) {
  const [w, h] = SPRITES[name];
  return (
    <img
      src={`/mascot/${name}.png`}
      alt=""
      aria-hidden
      draggable={false}
      width={w}
      height={h}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      className={`mx ${className}`}
      style={vars(name, style)}
    />
  );
}

/**
 * A frame strip (N frames left to right) played with CSS steps(N).
 * `dur` — seconds per full loop; `frame` pins one frame instead (no animation).
 */
export function Strip({
  name,
  dur = 0.6,
  frame,
  className = "",
  style,
}: {
  name: SpriteName;
  dur?: number;
  frame?: number;
  className?: string;
  style?: Vars;
}) {
  return (
    <span
      aria-hidden
      className={`mx mx-strip ${frame != null ? "mx-strip-still" : ""} ${className}`}
      style={vars(name, {
        backgroundImage: `url(/mascot/${name}.png)`,
        "--dur": `${dur}s`,
        ...(frame != null ? { "--f": frame } : {}),
        ...style,
      })}
    />
  );
}
