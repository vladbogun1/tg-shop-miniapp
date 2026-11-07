"use client";

import { useEffect, useRef } from "react";

/**
 * A floating menu is pinned to its button: close it when the button moves away (a scroll of the page or of
 * any container, a resize), but NOT on a scroll event that left the button where it was. Browsers deliver
 * scroll events a frame late, so the scroll that merely brought the button into view just before the tap
 * would otherwise close the menu the very moment it opened.
 */
export function useCloseOnAnchorMove(open: boolean, anchor: () => Element | null, close: () => void): void {
  const anchorRef = useRef(anchor);
  const closeRef = useRef(close);
  anchorRef.current = anchor;
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const start = anchorRef.current()?.getBoundingClientRect();
    const onScroll = () => {
      const now = anchorRef.current()?.getBoundingClientRect();
      if (!start || !now || Math.abs(now.top - start.top) > 1 || Math.abs(now.left - start.left) > 1) closeRef.current();
    };
    const onResize = () => closeRef.current();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);
}
