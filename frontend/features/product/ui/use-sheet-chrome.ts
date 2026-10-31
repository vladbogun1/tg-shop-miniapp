"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Chrome of a fullscreen overlay: body-scroll lock, Esc closes, the tab bar comes back under the sheet's
 * action bar, and the action bar's measured height (the copy scrolls exactly past it).
 */
export function useSheetChrome(onClose: () => void) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // the tab bar (which may have slid away in the catalogue) comes back under the sheet's action bar
    document.documentElement.setAttribute("data-sheet", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-sheet");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // The action bar (button + hint + the tab bar under it) is taller than any fixed guess once the
  // hint or a variant warning wraps, and the end of the description hid behind it. The copy now
  // scrolls exactly past the bar's measured height, plus breathing room.
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState<number | null>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { barRef, barH };
}
