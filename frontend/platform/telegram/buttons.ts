"use client";

import { useEffect, useRef } from "react";
import { webApp } from "./webapp";

/**
 * Keeps Telegram's native MainButton hidden.
 *
 * The primary action is an in-page button instead: the native one duplicated it and ate vertical
 * space inside the WebApp. Called once from the app root — every screen used to invoke a no-op
 * `useMainButton(...)` whose arguments (label, click handler, loading state) were all ignored.
 */
export function useHideMainButton(): void {
  useEffect(() => {
    webApp()?.MainButton?.hide();
  }, []);
}

/**
 * While `active`, shows Telegram's native back button and routes it — and Android's hardware back,
 * which would otherwise close the whole Mini App — to `onBack`. Used by full-screen overlays (the
 * payment sheet). No-op outside Telegram.
 */
export function useBackButton(active: boolean, onBack: () => void): void {
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const bb = webApp()?.initData ? webApp()?.BackButton : undefined;
    if (!bb) return;
    const handler = () => cb.current();
    try {
      bb.onClick(handler);
      bb.show();
    } catch {
      return;
    }
    return () => {
      try {
        bb.offClick(handler);
        bb.hide();
      } catch {
        /* noop */
      }
    };
  }, [active]);
}
