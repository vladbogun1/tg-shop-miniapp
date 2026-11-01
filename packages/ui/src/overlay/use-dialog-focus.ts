"use client";

import { useCallback, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[inert]") && el.offsetParent !== null);
}

/**
 * Focus management of a dialog, as a callback ref for its root element (the element is mounted inside
 * AnimatePresence, so an effect on `open` would run before it exists).
 *
 * On mount the focus moves into the dialog (to the root itself, so a phone keyboard does not pop up for
 * the first field); Tab / Shift+Tab cycle inside it; when the dialog unmounts the focus returns to
 * the element that opened it. Esc is handled by the overlay stack.
 */
export function useDialogFocus(): (el: HTMLElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.tabIndex = -1;
    el.style.outline = "none";
    (el.querySelector<HTMLElement>("[autofocus],[data-autofocus]") ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    cleanup.current = () => {
      el.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}
