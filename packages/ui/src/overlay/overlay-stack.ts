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
  /** Esc is left to the component's own handler (a drag in progress cancels itself, not the modal under it). */
  passEscape?: boolean;
}

const stack: Layer[] = [];
let listening = false;
let scrollLocks = 0;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  // An IME composition owns its own Escape.
  if (e.isComposing) return;
  const top = stack[stack.length - 1];
  if (top.passEscape) {
    top.onEscape();
    return;
  }
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

type ScrollDoc = { body: { style: { overflow: string } } };

/**
 * Locks page scroll until the returned release is called; the page scrolls again only when the
 * last lock is released, in any order. Every overlay that locks the page goes through here: the
 * Mini App's product view and comparison used to save/restore `overflow` themselves, and when
 * the product view finished fading out after the comparison had opened, the comparison restored
 * "hidden" on close — the catalogue stopped scrolling (iPhone, 02.11.2026).
 */
export function lockPageScroll(doc: ScrollDoc | undefined = typeof document === "undefined" ? undefined : document): () => void {
  if (!doc) return () => {};
  if (scrollLocks++ === 0) doc.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) doc.body.style.overflow = "";
  };
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
  opts: { lockScroll?: boolean; passEscape?: boolean } = {}
): string {
  const id = useId();
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  }, [onEscape]);
  const lock = opts.lockScroll ?? true;
  const passEscape = opts.passEscape ?? false;

  useEffect(() => {
    if (!open) return;
    ensureListener();
    const layer: Layer = { id, onEscape: () => handler.current(), passEscape };
    stack.push(layer);
    const unlock = lock ? lockPageScroll() : undefined;
    return () => {
      const i = stack.lastIndexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      unlock?.();
    };
  }, [open, id, lock, passEscape]);

  return id;
}
