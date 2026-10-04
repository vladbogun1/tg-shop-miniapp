/**
 * One stack for every overlay (Modal, Drawer, Lightbox, bottom sheets).
 *
 * Each overlay used to put its own `keydown` listener on window, so Esc closed ALL of them at once:
 * the order drawer disappeared while the "Выслан (+ТТН)" modal stayed on screen without an order,
 * and its "Подтвердить" silently did nothing. Now Esc goes only to the topmost layer, and the body
 * scroll lock is reference-counted so closing an inner modal does not unlock the page under an
 * open drawer.
 */
import { useEffect, useId, useRef } from "react";

interface Layer {
  id: string;
  onEscape: () => void;
}

const stack: Layer[] = [];
let listening = false;
let scrollLocks = 0;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  // An IME composition owns its own Escape.
  if (e.isComposing) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].onEscape();
}

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  // Capture phase: runs before any component-level handler, so nothing else reacts to the same key.
  window.addEventListener("keydown", onKeyDown, true);
  listening = true;
}

function lockScroll() {
  if (typeof document === "undefined") return;
  if (scrollLocks === 0) document.body.style.overflow = "hidden";
  scrollLocks++;
}

function unlockScroll() {
  if (typeof document === "undefined") return;
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = "";
}

/** True when the layer with this id is the topmost open overlay. */
export function isTopLayer(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

/**
 * Registers an overlay while `open`. `onEscape` is called only when this overlay is on top.
 * Returns the layer id (for {@link isTopLayer}).
 */
export function useOverlayLayer(
  open: boolean,
  onEscape: () => void,
  opts: { lockScroll?: boolean } = {}
): string {
  const id = useId();
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  }, [onEscape]);
  const lock = opts.lockScroll ?? true;

  useEffect(() => {
    if (!open) return;
    ensureListener();
    const layer: Layer = { id, onEscape: () => handler.current() };
    stack.push(layer);
    if (lock) lockScroll();
    return () => {
      const i = stack.lastIndexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (lock) unlockScroll();
    };
  }, [open, id, lock]);

  return id;
}
