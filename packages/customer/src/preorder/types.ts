/**
 * Модель предзаказов («їде до нас», очередь «Повідомити, коли приїде», «Мої очікування»): формы ответов бэкенда
 * и чистые проверки статуса. Без React: файл читают и сервер сайта (RSC, фиды), и клиент.
 */

export type EtaMode = "DATE" | "RANGE" | "APPROX" | "HIDDEN";

export interface PreorderEta {
  /** `ordered` | `in_transit` — трёхшаговая шкала (Замовлено → В дорозі → На складі). */
  stage: "ordered" | "in_transit";
  mode: EtaMode;
  from: string | null;
  to: string | null;
  /** Только для APPROX; 0 = «найближчим часом». */
  approxWeeks: number | null;
  note: string | null;
}

export interface ComingBatch {
  eta: PreorderEta;
  /** Срок брони партии, часы (нет у старого бэкенда). */
  holdHours?: number;
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
  /** null ниже порога «показывать от». */
  waitingCount: number | null;
  /** В очередь можно встать и без партии. */
  anyProduct: boolean;
  mine: MyPreorder[];
  /** Сколько часов держится приехавшая единица (нет у старого бэкенда). */
  holdHours?: number;
}

/** Срок брони, когда бэкенд его не прислал. */
export const DEFAULT_HOLD_HOURS = 24;

export const LIVE_STATUSES: PreorderStatus[] = ["WAITING", "HELD", "NOTIFIED"];

export function isLive(s: PreorderStatus): boolean {
  return LIVE_STATUSES.includes(s);
}

/** Очередь, в которой я стою: жду или меня уже известили, а я ещё не купил. */
export function isQueued(p: Pick<MyPreorder, "status">): boolean {
  return p.status === "WAITING" || p.status === "NOTIFIED";
}

/** Бронь, которая ещё идёт (`now` — мс; приложение даёт своё время). */
export function isLiveHold(p: MyPreorder, now: number): boolean {
  return p.status === "HELD" && p.heldQty > 0 && !!p.holdUntil && new Date(p.holdUntil).getTime() > now;
}

const sameLine = (p: MyPreorder, productId: string, variantId: string | null) =>
  p.productId === productId && (p.variantId ?? null) === variantId;

export function heldFor(list: MyPreorder[], productId: string, variantId: string | null, now: number): MyPreorder | undefined {
  return list.find((p) => sameLine(p, productId, variantId) && isLiveHold(p, now));
}

/** Моё место в очереди на эту строку. */
export function queuedFor(list: MyPreorder[], productId: string, variantId: string | null): MyPreorder | undefined {
  return list.find((p) => sameLine(p, productId, variantId) && isQueued(p));
}
