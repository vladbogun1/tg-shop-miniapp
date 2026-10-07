"use client";

/**
 * Keeps the Mini App cart in step with the customer's server cart — the same one the website shows
 * when they sign in there with this Telegram account (docs/SITE-SPEC.md, «Серверная корзина»).
 *
 * - Nothing goes to `/api/me/**` before the initData → JWT exchange is done (docs/archive/UI-FIXES.md: requests that
 *   beat the token got 403). Until then the store shows its persisted copy.
 * - First run after this release (`migrated` not set): the cart that lived only on this device is
 *   MERGED into the server cart once (same line → the larger quantity), then the server is the truth.
 *   Changes made before the token arrived are merged the same way, so nothing added is lost.
 * - Every change is applied locally at once and written with `PUT /api/me/cart` 400 ms after the
 *   last one. The answer is adopted only if nothing changed locally in the meantime.
 * - The app becomes visible again (or a new token arrives) → re-read the server cart.
 *   Being hidden flushes a pending write with `keepalive`.
 * - Lines the shop can't sell right now (hidden, sold out) are NOT shown here — the Mini App has no
 *   "unavailable" state in its cart and its checkout would fail on them — but they are kept in every
 *   write, so they stay on the server (the site shows them flagged) and come back when sold again.
 */
import { cartSignature, type CartLineInput, type ServerCart } from "@shop/shared";
import { customerApi, getAccessToken, onAccessToken, putCartOnUnload } from "./api";
import { lineKey, useCart, type CartLine } from "./cart";

const WRITE_DEBOUNCE_MS = 400;
const REFRESH_GAP_MS = 2_000;

let active = false;
let starting: Promise<void> | null = null;
let syncedSig: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let applying = false;
/** The customer changed the cart before the sync could start (token not there yet). */
let editedBeforeStart = false;
/** Server lines not shown here (unavailable); sent back with every write. */
let hidden: CartLineInput[] = [];
let lastRefresh = 0;

function inputs(lines: CartLine[]): CartLineInput[] {
  return lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }));
}

function localSig(): string {
  return cartSignature(inputs(useCart.getState().lines));
}

function setLines(patch: Partial<{ lines: CartLine[]; promoCode: string; migrated: boolean }>): void {
  applying = true;
  try {
    useCart.setState(patch);
  } finally {
    applying = false;
  }
}

function adopt(cart: ServerCart): void {
  const visible: CartLine[] = [];
  const unsellable: CartLineInput[] = [];
  for (const s of cart.lines) {
    if (!s.available) {
      unsellable.push({ productId: s.productId, variantId: s.variantId, quantity: s.quantity });
      continue;
    }
    visible.push({
      key: lineKey(s.productId, s.variantId),
      productId: s.productId,
      variantId: s.variantId,
      variantName: s.variantName,
      title: s.title,
      priceMinor: s.priceMinor,
      currency: s.currency,
      imageUrl: s.imageUrl,
      stock: s.stock,
      // The cart clamps to stock everywhere else too; the clamp is written back below.
      quantity: Math.max(1, Math.min(s.quantity, s.stock)),
    });
  }
  hidden = unsellable;
  syncedSig = cartSignature(
    cart.lines.filter((s) => s.available).map((s) => ({ productId: s.productId, variantId: s.variantId, quantity: s.quantity }))
  );
  setLines({ lines: visible });
  if (cartSignature(inputs(visible)) !== syncedSig) schedule();
}

function payload(): CartLineInput[] {
  return [...inputs(useCart.getState().lines), ...hidden];
}

async function push(): Promise<void> {
  timer = null;
  if (!active || !getAccessToken()) return;
  if (inflight) {
    await inflight;
    return push();
  }
  const sig = localSig();
  if (sig === syncedSig) return;
  const run = (async () => {
    try {
      const cart = await customerApi.putCart(payload());
      if (localSig() === sig) adopt(cart);
      else syncedSig = sig;
    } catch {
      /* stays local; goes out with the next change or when the app is opened again */
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

/** Sends a pending change now and waits for it (the checkout calls this before placing an order). */
export async function flushCart(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await push();
  } else if (inflight) {
    await inflight;
  }
}

async function refresh(force = false): Promise<void> {
  if (!active || !getAccessToken()) return;
  const now = Date.now();
  if (!force && now - lastRefresh < REFRESH_GAP_MS) return;
  lastRefresh = now;
  await flushCart();
  try {
    const before = localSig();
    const cart = await customerApi.getCart();
    if (localSig() === before && !timer && !inflight) adopt(cart);
  } catch {
    /* keep what we have */
  }
}

function start(): Promise<void> {
  if (active) return refresh(true);
  if (!starting) {
    starting = (async () => {
      try {
        const st = useCart.getState();
        const mergeLocal = (!st.migrated || editedBeforeStart) && st.lines.length > 0;
        const cart = mergeLocal
          ? await customerApi.mergeCart(inputs(st.lines))
          : await customerApi.getCart();
        editedBeforeStart = false;
        active = true;
        lastRefresh = Date.now();
        setLines({ migrated: true });
        adopt(cart);
      } catch {
        /* retried on the next token / when the app becomes visible */
      } finally {
        starting = null;
      }
    })();
  }
  return starting;
}

/**
 * After a successful order: the server already removed the ordered lines in the order's own
 * transaction, so they go locally without a write (which could only race the other device), then
 * the cart is re-read.
 */
export function cartAfterOrder(orderedKeys: string[]): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const gone = new Set(orderedKeys);
  const lines = useCart.getState().lines.filter((l) => !gone.has(l.key));
  setLines({ lines, promoCode: "" });
  if (active) {
    syncedSig = cartSignature(inputs(lines));
    void refresh(true);
  }
}

/** Starts the sync for the app's lifetime; returns the cleanup. Called once from Providers. */
export function startCartSync(): () => void {
  const unsubscribeStore = useCart.subscribe((state, prev) => {
    if (applying || state.lines === prev.lines) return;
    if (!active) {
      editedBeforeStart = true;
      return;
    }
    if (cartSignature(inputs(state.lines)) !== syncedSig) schedule();
  });

  // Requests to /api/me/** wait for the token; a re-login's new token re-reads the cart.
  const unsubscribeToken = onAccessToken((token) => {
    if (token) void start();
  });
  if (getAccessToken()) void start();

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      if (!active && getAccessToken()) void start();
      else void refresh();
    } else if (active && timer) {
      clearTimeout(timer);
      timer = null;
      const lines = payload();
      putCartOnUnload(lines);
      syncedSig = localSig();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    unsubscribeStore();
    unsubscribeToken();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
