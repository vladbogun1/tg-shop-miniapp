"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Makes the browser / phone "Назад" close an overlay instead of leaving the page.
 *
 * While `open`, one history entry is pushed (same URL, our marker in `history.state`). Back pops it
 * and we call `onClose`. Closing from the UI goes through the returned `close()`, which pops our
 * entry first so the history does not fill up with dead entries. Next's app router keeps its own
 * data in `history.state`; the existing state is spread into ours so it stays intact.
 *
 * `navigatesAway`: `onClose` itself navigates (the /orders/{id} deep link goes to "/"). Then the
 * marker is only cleared — an async `history.back()` racing the router's push would land the user
 * back on the order.
 */
export function useBackToClose(
  open: boolean,
  onClose: () => void,
  opts: { marker?: string; navigatesAway?: boolean } = {}
): () => void {
  const marker = `__${opts.marker ?? "overlay"}`;
  const navigatesAway = !!opts.navigatesAway;
  const pushed = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.history.pushState({ ...(window.history.state ?? {}), [marker]: true }, "");
    pushed.current = true;

    const onPop = () => {
      // Our entry is gone (Back was pressed): close without touching history again.
      if (pushed.current && !window.history.state?.[marker]) {
        pushed.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, marker]);

  return useCallback(() => {
    if (pushed.current && typeof window !== "undefined") {
      pushed.current = false;
      if (navigatesAway) {
        const rest = { ...(window.history.state ?? {}) };
        delete rest[marker];
        window.history.replaceState(rest, "");
      } else {
        // Drop our entry; the popstate it fires is ignored now that `pushed` is false.
        window.history.back();
      }
    }
    onCloseRef.current();
  }, [marker, navigatesAway]);
}
