"use client";

/**
 * Pre-orders («Передзамовлення», «Скоро в наявності», «Мої очікування») — endpoints, query hooks and
 * the small pure helpers the card, the product page and the account screen share.
 *
 * Reminder of the model: the catalog `stock` is already net of reservations (other people's AND my
 * own), so a held unit shows up as stock 0 — `heldQty` below is what the customer may still buy.
 */
import type { LooseT } from "@shop/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildPreorderIndex } from "@shop/customer/preorder/coming";
import { createPreorderApi } from "@shop/customer/preorder/api";
import { preorderKeys as preorderKeysShared } from "@shop/customer/preorder/keys";
import {
  DEFAULT_HOLD_HOURS,
  heldFor as heldForAt,
  isQueued,
  isLiveHold as isLiveHoldAt,
  type ComingBatch,
  type MyPreorder,
  type PreorderEta,
} from "@shop/customer/preorder/types";
import { apiDel, apiGet, apiPost, type Product } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { formatMoment, nowMs } from "@shop/core/time";

export { DEFAULT_HOLD_HOURS, queuedFor, type ComingBatch, type MyPreorder, type PreorderEta, type PreorderStatus, type ProductPreorder } from "@shop/customer/preorder/types";

const api = createPreorderApi({ get: apiGet, post: apiPost, del: apiDel });

export const preorderApi = {
  coming: () => api.coming(),
  forProduct: (id: string, signedIn: boolean) => (signedIn ? api.forProduct(id) : api.forProductPublic(id)),
  mine: () => api.mine(),
  // the Mini App leaves an empty variant out of the body
  subscribe: (productId: string, variantId: string | null, qty: number) => api.subscribe(productId, variantId ?? undefined, qty),
  leave: (id: number) => api.leave(id),
};

export const preorderKeys = {
  coming: preorderKeysShared.coming,
  mine: preorderKeysShared.mineInApp,
  product: (id: string, signedIn: boolean) => preorderKeysShared.product(id, signedIn),
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
  /** Hold length of the soonest batch that brings the product, hours. */
  holdHoursOf: (productId: string) => number;
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
    const idx = buildPreorderIndex(q.data ?? []);
    return {
      etaOf: (productId: string, variantId: string | null) => (variantId ? idx.variants.get(`${productId}::${variantId}`) : idx.products.get(productId)),
      productEta: (productId: string) => idx.any.get(productId),
      holdHoursOf: (productId: string) => idx.holdHours.get(productId) ?? DEFAULT_HOLD_HOURS,
      productIds: idx.order,
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
export function isLiveHold(p: MyPreorder, now = nowMs()): boolean {
  return isLiveHoldAt(p, now);
}

export function heldFor(list: MyPreorder[], productId: string, variantId: string | null): MyPreorder | undefined {
  return heldForAt(list, productId, variantId, nowMs());
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
  const queued = mine.some((m) => m.productId === p.id && isQueued(m));
  const eta = coming.productEta(p.id);
  return eta ? { kind: "preorder", eta, queued } : { kind: "out", queued };
}

/** Catalog order: in stock (and held by me) → pre-order → out of stock. */
export function preorderTier(s: PreorderCardState | null): 0 | 1 | 2 {
  if (!s || s.kind === "held") return 0;
  return s.kind === "preorder" ? 1 : 2;
}

// ---- eta text --------------------------------------------------------------------------------

type T = LooseT;

function parseDay(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function dayMonth(d: Date, tag: string): string {
  return formatMoment(d, { day: "numeric", month: "short" }, tag).replace(/\.$/, "");
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
  const time = formatMoment(d, { hour: "2-digit", minute: "2-digit", hour12: false }, tag);
  return d.toDateString() === new Date(nowMs()).toDateString() ? time : `${time} (${dayMonth(d, tag)})`;
}
