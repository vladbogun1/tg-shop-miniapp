"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * «Hide while scrolling down, come back on the first scroll up» for a sticky phone panel.
 * Hidden only after `min` px from the top and a downward step bigger than `delta`; shown again on
 * an upward step, near the top (also covers the iOS rubber band, scrollY < 0) and via `reveal()`.
 * While a text field has focus the panel never hides (the keyboard scrolls the page).
 */
export function useHideOnScroll(enabled: boolean, min = 120, delta = 6): { hidden: boolean; reveal: () => void } {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    last.current = window.scrollY;
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const y = window.scrollY;
        const dy = y - last.current;
        const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
        if (y < 8 || dy < -delta) setHidden(false);
        else if (dy > delta && y > min && !typing) setHidden(true);
        if (Math.abs(dy) > delta || y < 8) last.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [enabled, min, delta]);

  const reveal = useCallback(() => setHidden(false), []);
  return { hidden, reveal };
}
