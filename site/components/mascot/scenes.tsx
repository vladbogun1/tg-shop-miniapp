import { Strip } from "./Sprite";

/**
 * Pixel-mascot scenes for the site (no hooks, no client JS — everything moves in mascot.css).
 * Coordinates are art px; the host's --px turns them into whole-multiple screen px.
 */

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
