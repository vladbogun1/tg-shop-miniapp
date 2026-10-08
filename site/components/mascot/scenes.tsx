import { Spr, Strip } from "./Sprite";

/**
 * Pixel-mascot scenes for the site (no hooks, no client JS — everything moves in mascot.css).
 * Coordinates are art px; the host's --px turns them into whole-multiple screen px.
 */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;
const at = (x: number, y: number): Vars => ({ "--x": x, "--y": y });

/* ---------------------------------------------------------------------------------------------
 * Home hero «Доставка ChiSetup» (docs/MASCOT-STORYBOARD.md §1). 160×88 art px, floor y=76, one 12 s
 * cycle for every track (mascot.css §1): the forklift rolls in with a box up on its forks, lowers it
 * in three steps, backs off; the «21» mascot walks up, the box shakes, bursts open and fans out the
 * goods, they hang in a showcase, fly off to the cart, the box folds and vanishes, everyone goes home.
 * Art lives in /public/mascot/hero (1 art px = 1 png px).
 * ------------------------------------------------------------------------------------------- */

const H = "/mascot/hero/";

/** A sprite (or frame strip) of the hero scene; the frame is chosen by the element's keyframes. */
function F({ src, w, h, n = 1, className = "", style }: { src: string; w: number; h: number; n?: number; className?: string; style?: Vars }) {
  return (
    <span
      className={`mx mx-f ${className}`}
      style={{ "--w": w, "--h": h, "--n": n, backgroundImage: `url(${H}${src}.png)`, ...style } as Vars}
    />
  );
}

/**
 * The goods that fan out of the box, in flight order (each lands in the SLOTS entry of the same
 * rank). Adding one = one line here (+ its `p_<name>.png`, 17–22 art px, in /public/mascot/hero).
 * Up to 6 fit the showcase.
 */
const GOODS: [name: string, w: number, h: number][] = [
  ["keyboard", 20, 8],
  ["mouse", 18, 12],
  ["glides", 17, 15],
  ["headset", 17, 19],
  ["keycaps", 18, 17],
  ["cable", 18, 17],
];

/**
 * Showcase slots (item centres): a two-row fan over the box, left of the mascot (clear of his fists
 * mid-jump and of his finger when he points at them) and above the parked forklift's beacon.
 */
const SLOTS: [number, number][] = [
  [38, 32],
  [52, 13],
  [58, 31],
  [71, 10],
  [77, 31],
  [90, 12],
];
const MOUTH: [number, number] = [70, 59]; // where the goods leave the open box
const CART: [number, number] = [150, 9]; // top-right corner: the cart button on the page

/** Integer per-item keyframe points (art px, relative to the start at the box mouth). */
function goodVars(i: number, n: number, w: number, h: number): Vars {
  const [sx, sy] = MOUTH;
  const slot = SLOTS[n <= 1 ? 3 : Math.round((i * (SLOTS.length - 1)) / (n - 1))];
  const dx = slot[0] - sx;
  const dy = slot[1] - sy;
  const top = 1 + Math.floor(h / 2) - sy; // never above the panel's top edge (1 px margin)
  const v: Vars = {
    "--x": sx - Math.floor(w / 2),
    "--y": sy - Math.floor(h / 2),
    "--w": w,
    "--h": h,
    "--gd": `${(i * 0.12).toFixed(2)}s`,
    "--sp": dx < 0 ? 1 : -1,
    "--pop-x": Math.floor(w / 2) - 3,
    "--pop-y": Math.floor(h / 2) - 3,
  };
  // the arc out of the box, 8 points: up first, then over (a fountain) — so the right-hand goods
  // clear the mascot's fists while he jumps
  for (let k = 0; k < 8; k++) {
    const s = k / 7;
    v[`--x${k}`] = Math.round(dx * s * s);
    v[`--y${k}`] = Math.max(top, Math.round(dy * s * (2 - s)));
  }
  // to the cart: 6 more points, a flatter arc
  const cx = CART[0] - sx;
  const cy = CART[1] - sy;
  for (let k = 1; k < 7; k++) {
    const s = k / 6;
    v[`--c${k}x`] = Math.round(dx + (cx - dx) * s);
    v[`--c${k}y`] = Math.max(top, Math.round(dy + (cy - dy) * s - 24 * s * (1 - s)));
  }
  return v;
}

export function HeroScene() {
  return (
    <div aria-hidden className="mx-hero">
      <span className="mx-hero-grid" />
      <span className="mx-hero-floor" />
      <span className="mx-h-wall" />
      <span className="mx-cart-glow" />

      {/* forklift (faces right) with the box up on its forks */}
      <span className="mx-at mx-h" style={at(0, 28)}>
        <span className="mx-shadow" />
        <F src="hauler" w={64} h={48} n={7} className="mx-h-body" />
        <span className="mx-h-beacon" />
        <span className="mx-h-fork">
          <F src="box" w={30} h={24} n={3} className="mx-h-carry" />
          <F src="fork" w={19} h={13} />
        </span>
        <F src="dust" w={14} h={14} n={5} className="mx-h-dust" />
        <F src="dust" w={14} h={14} n={5} className="mx-h-dust mx-h-dust2" />
      </span>

      {/* the box on the floor, from the touchdown on */}
      <span className="mx-at mx-b" style={at(55, 52)}>
        <span className="mx-shadow" />
        <F src="box" w={30} h={24} n={3} className="mx-b-f" />
      </span>
      <F src="dust" w={14} h={14} n={5} className="mx-at mx-b-land" style={at(44, 62)} />
      <F src="dust" w={14} h={14} n={5} className="mx-at mx-b-land" style={at(80, 62)} />
      <F src="dust" w={14} h={14} n={5} className="mx-at mx-b-poof" style={at(56, 62)} />
      <F src="dust" w={14} h={14} n={5} className="mx-at mx-b-poof" style={at(70, 60)} />
      <F src="dust" w={14} h={14} n={5} className="mx-at mx-b-poof" style={at(63, 57)} />

      {/* the goods, behind the box front until they clear it */}
      {GOODS.map(([name, w, h], i) => (
        <span key={name} className="mx-at mx-g" style={goodVars(i, GOODS.length, w, h)}>
          <span className="mx-g-bob">
            <F src={`p_${name}`} w={w} h={h} className="mx-g-img" />
            <F src="star" w={7} h={7} className="mx-g-glint" />
          </span>
          <F src="star" w={7} h={7} className="mx-g-trail" />
          <F src="star" w={7} h={7} className="mx-g-trail mx-g-trail2" />
          <F src="star" w={7} h={7} className="mx-g-pop" />
        </span>
      ))}

      {/* shake sparks, the burst and the swirl over the box */}
      <F src="star" w={7} h={7} className="mx-at mx-b-spark" style={{ ...at(60, 47), "--k": "mx-b-spark0" }} />
      <F src="star" w={7} h={7} className="mx-at mx-b-spark" style={{ ...at(69, 42), "--k": "mx-b-spark1" }} />
      <F src="star" w={7} h={7} className="mx-at mx-b-spark" style={{ ...at(78, 47), "--k": "mx-b-spark2" }} />
      <F src="flash" w={22} h={22} n={4} className="mx-at mx-b-flash" style={at(59, 43)} />
      <F src="swirl" w={30} h={30} n={4} className="mx-at mx-b-swirl" style={at(55, 30)} />

      {/* the «21» mascot (faces left) */}
      <span className="mx-at mx-m" style={at(98, 24)}>
        <span className="mx-shadow" />
        <span className="mx-m-y">
          <F src="hero" w={60} h={52} n={9} className="mx-m-f" />
        </span>
      </span>
    </div>
  );
}

/** Coin that pops out from behind a button's top edge on hover/focus/press. Put inside a `.mx-coin-host`. */
export function CoinPop() {
  return (
    <span aria-hidden className="mx-coinpop">
      <span className="mx-coinpop-c">
        <Strip name="coin" dur={0.24} />
      </span>
      <Strip name="spark" dur={0.3} className="mx-spark" />
    </span>
  );
}

/** Footer: the vacuum robot patrolling the top edge. Host must be `position: relative`. */
export function FooterSweeper() {
  return (
    <span aria-hidden className="mx-sweep-track">
      <span className="mx-sweep">
        <span className="mx-sweep-flip">
          <Strip name="sweeper" dur={0.4} />
        </span>
      </span>
    </span>
  );
}

/** Empty cart: the vacuum robot pottering about where the products would be. */
export function CartSweeper() {
  return (
    <span aria-hidden className="mx-cart">
      <span className="mx-sweep">
        <span className="mx-shadow" />
        <span className="mx-sweep-flip">
          <Strip name="sweeper" dur={0.4} />
        </span>
      </span>
    </span>
  );
}

/** 404: the mascot kicks the ?-block, a coin pops out (3 s loop). 92×80 art px. */
export function NotFoundScene() {
  return (
    <div aria-hidden className="mx-404">
      <span className="mx-shadow" />
      <span className="mx-at mx-404-kick" style={at(0, 24)}>
        <Spr name="kick" />
      </span>
      <span className="mx-at" style={at(68, 14)}>
        <span className="mx-404-coin block">
          <Strip name="coin" dur={0.24} />
        </span>
      </span>
      <span className="mx-at mx-404-block" style={at(64, 26)}>
        <Spr name="qblock" />
        <Spr name="qblock_hit" />
      </span>
      <Strip name="spark" dur={0.5} className="mx-at mx-404-spark" style={{ ...at(45, 18), "--win": "mx-404-win-hit" }} />
      <Strip name="spark" dur={0.5} className="mx-at mx-404-spark" style={{ ...at(55, -10), "--win": "mx-404-win-coin" }} />
    </div>
  );
}
