"use client";

/**
 * Keeps the website cart in step with the server cart of the signed-in customer — the same cart the
 * Mini App shows (docs/SITE-SPEC.md, «Серверная корзина»).
 *
 * - Guest: nothing happens here; the cart is local (`site-cart-v1`) as before.
 * - Sign-in: a non-empty guest cart is MERGED into the account's cart (same line → the larger
 *   quantity), then the store becomes a local copy of the server cart (`owner: "server"`).
 * - Signed in: every change is applied locally at once (optimistic) and written with
 *   `PUT /api/me/cart` 400 ms after the last one. The answer (current prices, stock, availability)
 *   is adopted only if nothing changed locally in the meantime.
 * - The window regains focus / the tab becomes visible → re-read the server cart (another device may
 *   have changed it). A tab being hidden flushes a pending write with `keepalive`.
 * - Sign-out (or a session that ended): the local copy is CLEARED — the cart is safe on the server,
 *   and the next person at a shared computer should not see it.
 *
 * Module state, not React state: there is one cart per tab, and the checkout needs to `flushCart()`
 * before placing the order without threading anything through props.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { cartSignature, type CartLineInput, type ServerCart, type ServerCartLine } from "@shop/shared";
import { api, isAuthFailure, putCartOnUnload } from "./api";
import { lineKey, useCart, type CartLine } from "./cart";
import { SESSION_KEY, useSession } from "./session";

const WRITE_DEBOUNCE_MS = 400;
/** `focus` and `visibilitychange` usually fire together; one re-read is enough. */
const REFRESH_GAP_MS = 2_000;

let active = false;
/** The session says "signed in": server mode should be on (retried on focus if the start failed). */
let wantServer = false;
let starting: Promise<void> | null = null;
/** Signature of the lines the server is known to hold. */
let syncedSig: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
/** Set while the store is written from a server answer, so the write is not echoed back. */
let applying = false;
let lastRefresh = 0;
let onAuthLost: (() => void) | null = null;

function inputs(lines: CartLine[]): CartLineInput[] {
  return lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }));
}

function localSig(): string {
  return cartSignature(inputs(useCart.getState().lines));
}

function toLine(s: ServerCartLine, prev: CartLine | undefined): CartLine {
  const priceChanged = !!prev && prev.priceMinor !== s.priceMinor;
  return {
    key: lineKey(s.productId, s.variantId),
    productId: s.productId,
    slug: s.slug,
    variantId: s.variantId,
    variantName: s.variantName,
    title: s.title,
    priceMinor: s.priceMinor,
    currency: s.currency,
    imageUrl: s.imageUrl,
    // The UI already treats stock 0 as "cannot be ordered" (greyed out, checkout blocked).
    stock: s.available ? s.stock : 0,
    quantity: s.quantity,
    previousPriceMinor: priceChanged ? prev!.priceMinor : (prev?.previousPriceMinor ?? null),
  };
}

function adopt(cart: ServerCart): void {
  const prev = new Map(useCart.getState().lines.map((l) => [l.key, l]));
  const lines = cart.lines.map((s) => toLine(s, prev.get(lineKey(s.productId, s.variantId))));
  applying = true;
  try {
    useCart.setState({ lines, owner: "server" });
  } finally {
    applying = false;
  }
  syncedSig = cartSignature(inputs(lines));
}

function handleError(e: unknown): void {
  if (isAuthFailure(e)) onAuthLost?.();
  // Anything else (offline, 5xx): the change stays local and goes out with the next one or on focus.
}

async function push(): Promise<void> {
  timer = null;
  if (!active) return;
  if (inflight) {
    await inflight;
    return push();
  }
  const lines = useCart.getState().lines;
  const sig = cartSignature(inputs(lines));
  if (sig === syncedSig) return;
  const run = (async () => {
    try {
      const cart = await api.putCart(inputs(lines));
      if (localSig() === sig) adopt(cart);
      else syncedSig = sig; // newer local edits are already scheduled
    } catch (e) {
      handleError(e);
    }
  })();
  inflight = run;
  try {
    await run;
  } finally {
    inflight = null;
  }
}

function schedule(): void {
  if (!active) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void push(), WRITE_DEBOUNCE_MS);
}

/** Sends a pending change now and waits for it (before checkout and sign-out). */
export async function flushCart(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await push();
  } else if (inflight) {
    await inflight;
  }
}

/** Re-reads the server cart unless there are local changes still on their way. */
async function refresh(force = false): Promise<void> {
  if (!active) return;
  const now = Date.now();
  if (!force && now - lastRefresh < REFRESH_GAP_MS) return;
  lastRefresh = now;
  await flushCart();
  try {
    const before = localSig();
    const cart = await api.cart();
    if (localSig() === before && !timer && !inflight) adopt(cart);
  } catch (e) {
    handleError(e);
  }
}

function startServerMode(): Promise<void> {
  if (active) return Promise.resolve();
  if (!starting) {
    starting = (async () => {
      try {
        const st = useCart.getState();
        const cart =
          st.owner !== "server" && st.lines.length > 0
            ? await api.mergeCart(inputs(st.lines))
            : await api.cart();
        adopt(cart);
        active = true;
        lastRefresh = Date.now();
      } catch (e) {
        handleError(e); // stays in local mode; the next session check tries again
      } finally {
        starting = null;
      }
    })();
  }
  return starting;
}

function stopServerMode(): void {
  active = false;
  if (timer) clearTimeout(timer);
  timer = null;
  syncedSig = null;
  applying = true;
  try {
    useCart.setState({ lines: [], promoCode: "", owner: "guest" });
  } finally {
    applying = false;
  }
}

/**
 * After a successful order: the server already removed the ordered lines (same transaction as the
 * order), so they go locally WITHOUT a write — a PUT here could only race a change made on the other
 * device. Then the cart is re-read.
 */
export function cartAfterOrder(orderedKeys: string[]): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const gone = new Set(orderedKeys);
  const lines = useCart.getState().lines.filter((l) => !gone.has(l.key));
  applying = true;
  try {
    useCart.setState({ lines, promoCode: "" });
  } finally {
    applying = false;
  }
  if (active) {
    syncedSig = cartSignature(inputs(lines));
    void refresh(true);
  }
}

/** Mounted once in Providers. */
export function CartSync(): null {
  const { status, confirmedGuest } = useSession();
  const qc = useQueryClient();

  useEffect(() => {
    onAuthLost = () => void qc.invalidateQueries({ queryKey: SESSION_KEY });
    return () => {
      onAuthLost = null;
    };
  }, [qc]);

  useEffect(() => {
    wantServer = status === "authed";
    if (status === "authed") {
      void startServerMode();
    } else if (confirmedGuest && (active || useCart.getState().owner === "server")) {
      // Only a confirmed "not signed in" — an unreachable backend must not wipe the cart.
      stopServerMode();
    }
  }, [status, confirmedGuest]);

  useEffect(
    () =>
      useCart.subscribe((state, prev) => {
        if (applying || !active || state.lines === prev.lines) return;
        if (cartSignature(inputs(state.lines)) !== syncedSig) schedule();
      }),
    []
  );

  useEffect(() => {
    const wake = () => {
      if (wantServer && !active) void startServerMode();
      else void refresh();
    };
    const onFocus = wake;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        wake();
      } else if (active && timer) {
        clearTimeout(timer);
        timer = null;
        const lines = inputs(useCart.getState().lines);
        putCartOnUnload(lines);
        syncedSig = cartSignature(lines);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
