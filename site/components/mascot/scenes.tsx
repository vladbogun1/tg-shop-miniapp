import { Spr, Strip } from "./Sprite";

/**
 * Pixel-mascot scenes for the site (no hooks, no client JS — everything moves in mascot.css).
 * Coordinates are art px; the host's --px turns them into whole-multiple screen px.
 */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;
const at = (x: number, y: number): Vars => ({ "--x": x, "--y": y });

/**
 * Home hero, right column: the ChiSetup forklift brings a box, sets it down in front of the
 * waving «21» mascot and backs out (10 s loop, see mascot.css §1). 160×80 art px.
 */
export function HeroScene() {
  return (
    <div aria-hidden className="mx-hero">
      <span className="mx-hero-grid" />
      <span className="mx-hero-floor" />
      <span className="mx-at mx-hs-hero" style={at(94, 16)}>
        <span className="mx-hs-bob">
          <Spr name="hero_wave" className="mx-hs-wave" />
          <Spr name="hero_blink" className="mx-hs-blink" />
        </span>
      </span>
      <span className="mx-at mx-hs-box" style={at(70, 45)}>
        <span className="mx-shadow" />
        <Strip name="spark" dur={0.5} className="mx-hs-spark" />
        <Spr name="box" />
      </span>
      <span className="mx-at mx-hs-hauler" style={at(13, 8)}>
        <span className="mx-shadow" />
        <span className="mx-hs-flip">
          <Strip name="hauler" dur={0.36} />
        </span>
        <Dust className="mx-dust-rear" />
        <Dust className="mx-dust-front" />
      </span>
    </div>
  );
}

function Dust({ className }: { className: string }) {
  return (
    <span className={`mx-dust ${className}`}>
      <i style={{ "--d": 0 } as Vars} />
      <i style={{ "--d": 1 } as Vars} />
      <i style={{ "--d": 2 } as Vars} />
    </span>
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
