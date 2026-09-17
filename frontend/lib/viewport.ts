"use client";

/**
 * On-screen-keyboard detection.
 *
 * A phone keyboard does not resize the layout viewport on iOS (and on Android only sometimes), so
 * a bottom-docked tab bar keeps sitting on top of the field the customer is typing into. The
 * visual viewport DOES shrink, and the difference between the two is what the keyboard occupies.
 *
 * Used to pull the tab bar (and anything else docked to the bottom) out of the way while the
 * keyboard is up — see TabBar and `--tabbar-h`.
 */
import { useEffect, useState } from "react";

/** Below this the shrink is browser chrome (URL bar) rather than a keyboard. */
const KEYBOARD_MIN_PX = 140;

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;

    const update = () => {
      // `offsetTop` matters when the page is scrolled under a pinned keyboard on iOS.
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setOpen(hidden > KEYBOARD_MIN_PX);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return open;
}
