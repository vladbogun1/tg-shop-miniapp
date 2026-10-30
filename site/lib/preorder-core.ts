/**
 * Pre-orders on the website (docs/PREORDERS-PLAN.md §4): the «їде до нас» state of a sold-out
 * product, the queue («Повідомити, коли приїде») and the customer's own places.
 *
 * Isomorphic part: types, the index of open batches, ETA wording (server and client).
 */
import { formatMoment, momentParts, nowMs } from "@shop/core/time";
import { availabilityOf } from "@shop/core/availability";
import { LOCALE_TAG, type Locale } from "@shop/core/i18n";
import { type StorefrontProduct } from "@shop/core/site";
import type { TFunction } from "@/i18n";

// ---------------------------------------------------------------- shapes (backend PreorderDtos)

export type EtaMode = "DATE" | "RANGE" | "APPROX" | "HIDDEN";

export interface PreorderEta {
  /** `ordered` | `in_transit` — the 3-step timeline (Замовлено → В дорозі → На складі). */
  stage: "ordered" | "in_transit";
  mode: EtaMode;
  from: string | null;
  to: string | null;
  /** Only for APPROX; 0 = «найближчим часом». */
  approxWeeks: number | null;
  note: string | null;
}

export interface ComingBatch {
  eta: PreorderEta;
  lines: { productId: string; variantId: string | null }[];
}

export type PreorderStatus = "WAITING" | "HELD" | "NOTIFIED" | "BOUGHT" | "EXPIRED" | "CANCELLED";

export interface MyPreorder {
  id: number;
  productId: string;
  variantId: string | null;
  productTitle: string;
  productSlug: string;
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

export interface ProductPreorder {
  productId: string;
  lines: { variantId: string | null; eta: PreorderEta }[];
  /** null below the «show from» threshold. */
  waitingCount: number | null;
  /** The customer may queue for out-of-stock goods even without a batch. */
  anyProduct: boolean;
  mine: MyPreorder[];
  /** How long a unit is held once it arrives, hours (absent on an older backend). */
  holdHours?: number;
}

/** Used when the backend does not send `holdHours`. */
export const DEFAULT_HOLD_HOURS = 24;

export const LIVE_STATUSES: PreorderStatus[] = ["WAITING", "HELD", "NOTIFIED"];

export function isLive(s: PreorderStatus): boolean {
  return LIVE_STATUSES.includes(s);
}

// ---------------------------------------------------------------- index of open batches (server)

/** Soonest open batch per product / per variant. Batches arrive soonest first, so the first one wins. */
export interface PreorderIndex {
  /** Any line of the product, whatever the variant (for a tile: «the product is on its way»). */
  any: Map<string, PreorderEta>;
  /** A line of exactly this variant (`productId::variantId`). */
  variants: Map<string, PreorderEta>;
  /** A line of the product itself (a product without variants). */
  products: Map<string, PreorderEta>;
  size: number;
}

export function buildPreorderIndex(batches: ComingBatch[]): PreorderIndex {
  const idx: PreorderIndex = { any: new Map(), variants: new Map(), products: new Map(), size: 0 };
  for (const b of batches) {
    for (const l of b.lines) {
      if (!idx.any.has(l.productId)) idx.any.set(l.productId, b.eta);
      if (l.variantId) {
        const k = `${l.productId}::${l.variantId}`;
        if (!idx.variants.has(k)) idx.variants.set(k, b.eta);
      } else if (!idx.products.has(l.productId)) {
        idx.products.set(l.productId, b.eta);
      }
    }
  }
  idx.size = idx.any.size;
  return idx;
}

/**
 * The ETA to show on a tile when the product is sold out (total stock 0) and a batch brings it;
 * null otherwise (in stock, or simply out of stock).
 */
export function preorderOf(p: StorefrontProduct, idx: PreorderIndex | null | undefined): PreorderEta | null {
  const eta = idx?.any.get(p.id) ?? null;
  return availabilityOf(p, null, { coming: !!eta }) === "preorder" ? eta : null;
}

/** 0 = in stock, 1 = pre-order, 2 = out of stock — the order of the lists. */
export function availabilityRank(p: StorefrontProduct, idx: PreorderIndex | null | undefined): 0 | 1 | 2 {
  const a = availabilityOf(p, null, { coming: !!idx?.any.has(p.id) });
  return a === "in_stock" ? 0 : a === "preorder" ? 1 : 2;
}

// ---------------------------------------------------------------- «my hold = my stock» in the cart

/** `productId::variantId` → units held for me. Module state: the cart code is not React. */
let holds = new Map<string, number>();

export function setHolds(next: Map<string, number>): void {
  holds = next;
}

/**
 * Stock the cart may keep for a line: what the server says, but at least what is held for me. The
 * public catalog shows «stock minus every hold», mine included, so a held place would read 0.
 */
export function holdFloor(productId: string, variantId: string | null, stock: number): number {
  return Math.max(stock, holds.get(`${productId}::${variantId ?? ""}`) ?? 0);
}

// ---------------------------------------------------------------- ETA wording

/** `2026-11-10` → a Date at noon UTC (no timezone drift when printed in UTC). */
function day(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
}

function monthName(d: Date, tag: string, style: "short" | "long"): string {
  // With the day: uk/ru need the genitive («листопада», «ноября»); a bare month gives «листопад».
  return (momentParts(d, { day: "numeric", month: style }, tag, "UTC").month ?? "").replace(/\.$/, "");
}

/** «20 лис» / «20 листопада» (en-GB: «20 Nov» / «20 November»). */
function dayMonth(iso: string, tag: string, style: "short" | "long"): string {
  const d = day(iso);
  return `${d.getUTCDate()} ${monthName(d, tag, style)}`;
}

/**
 * The expected time as a phrase that goes after «їде · » / «Очікуємо »: «10–20 лис», «20 листопада»,
 * «~2 тижні», «найближчим часом». null when the shop hides the date (HIDDEN).
 */
export function etaWhen(eta: PreorderEta, t: TFunction, locale: Locale, style: "short" | "long" = "short"): string | null {
  const tag = LOCALE_TAG[locale];
  if (eta.mode === "HIDDEN") return null;
  if (eta.mode === "APPROX") {
    const weeks = eta.approxWeeks ?? 0;
    return weeks > 0 ? t("preorder.when.weeks", { n: weeks }) : t("preorder.when.soon");
  }
  const from = eta.from ?? eta.to;
  if (!from) return null;
  const to = eta.mode === "RANGE" ? eta.to : null;
  if (!to || to.slice(0, 10) === from.slice(0, 10)) return dayMonth(from, tag, style);
  const a = day(from);
  const b = day(to);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${monthName(b, tag, style)}`;
  }
  return `${dayMonth(from, tag, style)} – ${dayMonth(to, tag, style)}`;
}

/** Tile line: «їде · 10–20 лис»; just «їде» when the date is hidden. */
export function cardEtaLine(eta: PreorderEta, t: TFunction, locale: Locale): string {
  const when = etaWhen(eta, t, locale, "short");
  return when ? t("preorder.card.eta", { when }) : t("preorder.card.etaHidden");
}

/** Product page: «Очікуємо 10–20 листопада», null when hidden. */
export function expectedLine(eta: PreorderEta, t: TFunction, locale: Locale): string | null {
  const when = etaWhen(eta, t, locale, "long");
  return when ? t("preorder.expected", { when }) : null;
}

/** Heading of a group on «Скоро в наявності» (the same phrase as the page uses). */
export function groupTitle(eta: PreorderEta, t: TFunction, locale: Locale): string {
  return expectedLine(eta, t, locale) ?? t("preorder.coming.groupHidden");
}

/**
 * The date schema.org's `availabilityStarts` / Google's `availability_date` want (YYYY-MM-DD); null for a
 * hidden or «soon» (no number of weeks) term. An approximate term counts from `now`.
 */
export function etaStartsOn(eta: PreorderEta, now: Date = new Date(nowMs())): string | null {
  if (eta.mode === "HIDDEN") return null;
  if (eta.mode === "APPROX") {
    if (!eta.approxWeeks || eta.approxWeeks <= 0) return null;
    return new Date(now.getTime() + eta.approxWeeks * 7 * 86_400_000).toISOString().slice(0, 10);
  }
  const d = eta.from ?? eta.to;
  return d ? d.slice(0, 10) : null;
}

/** Hold deadline: «18:00» today, «18:00 · 28 жовт» another day. */
export function holdUntilText(iso: string, locale: Locale): string {
  const d = new Date(iso);
  const tag = LOCALE_TAG[locale];
  const time = formatMoment(d, { hour: "2-digit", minute: "2-digit" }, tag);
  const now = new Date(nowMs());
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return time;
  const dm = formatMoment(d, { day: "numeric", month: "short" }, tag).replace(/\.$/, "");
  return `${time} · ${dm}`;
}

