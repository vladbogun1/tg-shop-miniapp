"use client";

/**
 * Pre-orders («Передзамовлення», «Скоро в наявності», «Мої очікування») — endpoints, query hooks and
 * the small pure helpers the card, the product page and the account screen share.
 *
 * Reminder of the model: the catalog `stock` is already net of reservations (other people's AND my
 * own), so a held unit shows up as stock 0 — `heldQty` below is what the customer may still buy.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiDel, apiGet, apiPost, type Product } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";

export interface PreorderEta {
  stage: "ordered" | "in_transit" | string;
  mode: "DATE" | "RANGE" | "APPROX" | "HIDDEN" | string;
  from: string | null;
  to: string | null;
  approxWeeks: number | null;
  note: string | null;
}

export type PreorderStatus = "WAITING" | "HELD" | "NOTIFIED" | "BOUGHT" | "EXPIRED" | "CANCELLED";

export interface MyPreorder {
  id: number;
  productId: string;
  variantId: string | null;
  productTitle: string;
  productSlug: string | null;
  imageUrl: string | null;
  variantName: string | null;
  qty: number;
  status: PreorderStatus;
  position: number | null;
  heldQty: number;
  holdUntil: string | null;
  createdAt: string;
  eta: PreorderEta | null;
}

export interface ComingBatch {
  eta: PreorderEta;
  lines: { productId: string; variantId: string | null }[];
}

export interface ProductPreorder {
  productId: string;
  lines: { variantId: string | null; eta: PreorderEta }[];
  waitingCount: number | null;
  anyProduct: boolean;
  mine: MyPreorder[];
}

export const preorderApi = {
  coming: () => apiGet<ComingBatch[]>("/api/public/preorders"),
  forProduct: (id: string, signedIn: boolean) =>
    apiGet<ProductPreorder>(signedIn ? `/api/me/preorders/product/${id}` : `/api/public/products/${id}/preorder`),
  mine: () => apiGet<MyPreorder[]>("/api/me/preorders"),
  subscribe: (productId: string, variantId: string | null, qty: number) =>
    apiPost<MyPreorder>("/api/me/preorders", { productId, variantId: variantId ?? undefined, qty }),
  leave: (id: number) => apiDel<void>(`/api/me/preorders/${id}`),
};

export const preorderKeys = {
  coming: ["preorders", "coming"] as const,
  mine: ["me", "preorders"] as const,
  product: (id: string, signedIn: boolean) => ["preorders", "product", id, signedIn] as const,
};

/** Quantity cap of the queue sheet when the anti-bot limit is off. */
export const QUEUE_MAX_QTY = 10;

const lineKeyOf = (productId: string, variantId: string | null | undefined) => `${productId}::${variantId ?? ""}`;

// ---- queries ---------------------------------------------------------------------------------

export interface Coming {
  /** Eta of this exact line (variantId null = a product without variants). */
  etaOf: (productId: string, variantId: string | null) => PreorderEta | undefined;
  /** Soonest eta of any line of the product. */
  productEta: (productId: string) => PreorderEta | undefined;
  /** Product ids in the order of their batches (soonest first). */
  productIds: string[];
}

/** Open batches → «product/variant → eta». Public, soonest batch first; empty while loading or on error. */
export function useComing(): Coming {
  const q = useQuery({
    queryKey: preorderKeys.coming,
    queryFn: preorderApi.coming,
    staleTime: 60_000,
    retry: 1,
  });
  return useMemo(() => {
    const exact = new Map<string, PreorderEta>();
    const byProduct = new Map<string, PreorderEta>();
    const order: string[] = [];
    for (const b of q.data ?? []) {
      for (const l of b.lines) {
        const k = lineKeyOf(l.productId, l.variantId);
        if (!exact.has(k)) exact.set(k, b.eta);
        if (!byProduct.has(l.productId)) {
          byProduct.set(l.productId, b.eta);
          order.push(l.productId);
        }
      }
    }
    return {
      etaOf: (productId: string, variantId: string | null) => exact.get(lineKeyOf(productId, variantId)),
      productEta: (productId: string) => byProduct.get(productId),
      productIds: order,
    };
  }, [q.data]);
}

/** My places in queues. Disabled until the Telegram sign-in produced a token. */
export function useMyPreorders() {
  const token = useAccessToken();
  const q = useQuery({
    queryKey: preorderKeys.mine,
    queryFn: preorderApi.mine,
    enabled: !!token,
    staleTime: 30_000,
    retry: 1,
  });
  const list = useMemo(() => q.data ?? [], [q.data]);
  return { ...q, list };
}

/** Pre-order block of one product (my places included when signed in). */
export function useProductPreorder(productId: string) {
  const token = useAccessToken();
  const signedIn = !!token;
  return useQuery({
    queryKey: preorderKeys.product(productId, signedIn),
    queryFn: () => preorderApi.forProduct(productId, signedIn),
    staleTime: 30_000,
    retry: 1,
  });
}

// ---- pure helpers ----------------------------------------------------------------------------

/** A hold that is still running. */
export function isLiveHold(p: MyPreorder, now = Date.now()): boolean {
  return p.status === "HELD" && p.heldQty > 0 && !!p.holdUntil && new Date(p.holdUntil).getTime() > now;
}

export function heldFor(list: MyPreorder[], productId: string, variantId: string | null): MyPreorder | undefined {
  return list.find((p) => p.productId === productId && (p.variantId ?? null) === variantId && isLiveHold(p));
}

/** My queue place for this line (waiting, or notified of an arrival I did not buy yet). */
export function queuedFor(list: MyPreorder[], productId: string, variantId: string | null): MyPreorder | undefined {
  return list.find(
    (p) => p.productId === productId && (p.variantId ?? null) === variantId && (p.status === "WAITING" || p.status === "NOTIFIED"),
  );
}

export function useHeldCount(): number {
  const { list } = useMyPreorders();
  return list.filter((p) => isLiveHold(p)).length;
}

/** What the catalog card / ribbon shows for a product that cannot simply be bought. */
export type PreorderCardState =
  | { kind: "held"; heldQty: number; holdUntil: string }
  | { kind: "preorder"; eta: PreorderEta; queued: boolean }
  | { kind: "out"; queued: boolean };

/**
 * Card state of an out-of-stock (or held-by-me) product; `null` = an ordinary in-stock product.
 * `inStock` is `productInStock(p)` — computed by the caller, which already has it.
 */
export function preorderCardState(p: Product, inStock: boolean, coming: Coming, mine: MyPreorder[]): PreorderCardState | null {
  if (inStock) return null;
  const held = mine.find((m) => m.productId === p.id && isLiveHold(m));
  if (held) return { kind: "held", heldQty: held.heldQty, holdUntil: held.holdUntil! };
  const queued = mine.some((m) => m.productId === p.id && (m.status === "WAITING" || m.status === "NOTIFIED"));
  const eta = coming.productEta(p.id);
  return eta ? { kind: "preorder", eta, queued } : { kind: "out", queued };
}

/** Catalog order: in stock (and held by me) → pre-order → out of stock. */
export function preorderTier(s: PreorderCardState | null): 0 | 1 | 2 {
  if (!s || s.kind === "held") return 0;
  return s.kind === "preorder" ? 1 : 2;
}

// ---- eta text --------------------------------------------------------------------------------

type T = (key: string, params?: Record<string, string | number>) => string;

function parseDay(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function dayMonth(d: Date, tag: string): string {
  return d.toLocaleDateString(tag, { day: "numeric", month: "short" }).replace(/\.$/, "");
}

/** The date part: «10–20 лис» / «20 лис» / «~2 тиж.» / «найближчим часом»; null when the shop hides the term. */
export function etaWhen(eta: PreorderEta | null | undefined, t: T, tag: string): string | null {
  if (!eta || eta.mode === "HIDDEN") return null;
  if (eta.mode === "APPROX") {
    return eta.approxWeeks && eta.approxWeeks > 0 ? t("preorder.eta.weeks", { n: eta.approxWeeks }) : t("preorder.eta.soon");
  }
  const from = parseDay(eta.from);
  const to = parseDay(eta.to);
  if (eta.mode === "RANGE" && from && to) {
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth() && from.getDate() !== to.getDate()) {
      return `${from.getDate()}–${dayMonth(to, tag)}`;
    }
    return `${dayMonth(from, tag)} – ${dayMonth(to, tag)}`;
  }
  const one = from ?? to;
  return one ? dayMonth(one, tag) : t("preorder.eta.soon");
}

/** One small line for a card: «їде · 10–20 лис» (dates), or the bare phrase for an approximate term. */
export function etaCardLine(eta: PreorderEta, t: T, tag: string): string | null {
  const when = etaWhen(eta, t, tag);
  if (!when) return null;
  if (eta.mode === "APPROX") return when;
  return t("preorder.eta.card", { stage: t(eta.stage === "in_transit" ? "preorder.eta.transit" : "preorder.eta.ordered"), d: when });
}

/** «18:00» today, «18:00 (28 жов)» another day — for a hold deadline. */
export function holdUntilText(iso: string, tag: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString() ? time : `${time} (${dayMonth(d, tag)})`;
}
