/**
 * Payment receipts of an order (monobank acquiring + the PRRO, Вчасно.Каса):
 *
 *  Customer: GET /api/me/orders/{id}/receipts
 *  Admin:    GET /api/admin/orders/{id}/receipts
 *  Download: `downloadUrl` — a server-relative, signed link (/api/receipts/file?…) valid ~10 min;
 *            works without an Authorization header (plain <a href>, Telegram downloadFile/openLink).
 *
 * Per paid invoice: the fiscal check of the sale, a return check per refund, and the bank's own
 * receipt (квитанція, always there). A fiscal check is issued seconds to minutes after the payment,
 * so the lists poll while one is still on its way — see {@link receiptsPollMs}.
 */
import type { OrderDetail } from "./types";

export type ReceiptKind = "FISCAL_SALE" | "FISCAL_RETURN" | "BANK";
/** PENDING — the PRRO is still issuing it; READY — downloadable; FAILED — the PRRO refused it. */
export type ReceiptStatus = "PENDING" | "READY" | "FAILED";

export interface Receipt {
  /** Stable key: `fiscal:<checkId>` / `bank:<invoice row id>`. */
  key: string;
  kind: ReceiptKind;
  status: ReceiptStatus;
  /** What monobank said about the status (mostly for FAILED). */
  statusText?: string | null;
  /** The check on the tax service (ДПС) site — fiscal checks only. */
  taxUrl?: string | null;
  /** When the payment was credited (bank receipt). */
  createdAt?: string | null;
  amountMinor?: number | null;
  /** Signed, server-relative; null until READY. */
  downloadUrl?: string | null;
}

/** Refetch every 20 s while a fiscal check is on its way… */
export const RECEIPTS_POLL_MS = 20_000;
/** …but stop after this long on the page (the bot sends the PDF to Telegram anyway). */
export const RECEIPTS_POLL_FOR_MS = 5 * 60_000;
/** A payment this fresh may not have its fiscal check listed yet. */
const FRESH_PAYMENT_MS = 10 * 60_000;

/** Money came in online at some point (so receipts exist), even if it was refunded later. */
export function hasOnlinePayment(order: Pick<OrderDetail, "receivedMinor" | "payment">): boolean {
  return order.receivedMinor > 0 || order.payment.status === "success" || order.payment.status === "reversed";
}

/** Still worth asking again: a fiscal check is being issued, or a fresh payment has none yet. */
export function receiptsInProgress(list: Receipt[] | undefined, now = Date.now()): boolean {
  if (!list || list.length === 0) return false;
  if (list.some((r) => r.kind !== "BANK" && r.status === "PENDING")) return true;
  const hasFiscal = list.some((r) => r.kind !== "BANK");
  return (
    !hasFiscal &&
    list.some((r) => r.kind === "BANK" && r.createdAt != null && now - Date.parse(r.createdAt) < FRESH_PAYMENT_MS)
  );
}

/**
 * react-query `refetchInterval` for a receipts list: {@link RECEIPTS_POLL_MS} while
 * {@link receiptsInProgress}, for at most {@link RECEIPTS_POLL_FOR_MS} since `since`.
 */
export function receiptsPollMs(list: Receipt[] | undefined, since: number, now = Date.now()): number | false {
  return receiptsInProgress(list, now) && now - since < RECEIPTS_POLL_FOR_MS ? RECEIPTS_POLL_MS : false;
}

/** `chisetup-1a2b3c4d-check.pdf` — the same names the server uses. */
export function receiptFileName(orderId: string, kind: ReceiptKind): string {
  const suffix = kind === "FISCAL_SALE" ? "check" : kind === "FISCAL_RETURN" ? "return" : "receipt";
  return `chisetup-${orderId.slice(0, 8)}-${suffix}.pdf`;
}
