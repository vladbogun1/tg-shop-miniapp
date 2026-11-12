"use client";

import { useCallback, useEffect, useRef } from "react";
import { carries, newToken, shouldPopOnClose, withoutKey, withoutStale, withToken } from "./back-close-state";

/** Tokens of the overlays open right now (any instance): never cleaned as stale. */
const live = new Set<string>();

/**
 * Makes the browser / phone "Назад" close an overlay instead of leaving the page.
 *
 * While `open`, one history entry is pushed (same URL, this opening's token under our key in `history.state`, see
 * back-close-state). Back pops it and we call `onClose`. Closing from the UI goes through the returned `close()`,
 * which pops our entry first — only if the current entry is still ours, so a close after the entry was already left
 * never pops someone else's. Next's app router keeps its own data in `history.state`; it is spread into ours.
 * Stale markers of ours on the current entry (a reload, iOS tab eviction) are cleaned when the overlay opens.
 *
 * Closed from outside (`open` turned false without `close()`): our token is only removed from the current entry,
 * not popped — the close often comes with a router navigation in flight, and an async `history.back()` would race it.
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
  const key = `__${opts.marker ?? "overlay"}`;
  const navigatesAway = !!opts.navigatesAway;
  /** Token of our pushed entry while it is ours to pop; `null` once closed. */
  const tokenRef = useRef<string | null>(null);
  /** `history.length` right after our push (see shouldPopOnClose). */
  const lengthRef = useRef(0);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const h = window.history;
    const cleaned = withoutStale(h.state, key, live);
    if (cleaned) h.replaceState(cleaned, "");
    const token = newToken();
    live.add(token);
    h.pushState(withToken(h.state, key, token), "");
    tokenRef.current = token;
    lengthRef.current = h.length;

    const onPop = () => {
      // Our entry is gone (Back was pressed): close without touching history again.
      if (tokenRef.current === token && !carries(window.history.state, key, token)) {
        tokenRef.current = null;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      live.delete(token);
    };
  }, [open, key]);

  // Closed from outside while mounted: our token must not stay on the current entry.
  useEffect(() => {
    const token = tokenRef.current;
    if (open || !token || typeof window === "undefined") return;
    tokenRef.current = null;
    if (carries(window.history.state, key, token)) window.history.replaceState(withoutKey(window.history.state, key), "");
  }, [open, key]);

  return useCallback(() => {
    const token = tokenRef.current;
    tokenRef.current = null;
    const h = typeof window === "undefined" ? undefined : window.history;
    if (token && h && shouldPopOnClose(h.state, key, token, h.length, lengthRef.current)) {
      if (navigatesAway) window.history.replaceState(withoutKey(window.history.state, key), "");
      // Drop our entry; the popstate it fires is ignored now that the token is cleared.
      else window.history.back();
    }
    onCloseRef.current();
  }, [key, navigatesAway]);
}
