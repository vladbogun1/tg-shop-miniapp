/** «Смена статуса»: чистые правила окна — что нужно для перехода и какое тело уходит на сервер. */
import type { OrderStatus } from "@shop/core/types";
import type { StatusChangeBody } from "../api";
import { isNovaPoshtaTtn, REJECT_REASON_LABEL, type RejectReasonCode } from "./status";

/** Reasons that mean the parcel travels back to the shop. */
export const BACK_REASONS: RejectReasonCode[] = ["REFUSED_AT_POST", "RETURNED"];

/** PAYMENT_TIMEOUT is set by the server only (not paid online within 24 h) — never offered here. */
const SYSTEM_REASONS: RejectReasonCode[] = ["PAYMENT_TIMEOUT", "MERGED"];
export const REASONS = (Object.keys(REJECT_REASON_LABEL) as RejectReasonCode[]).filter((r) => !SYSTEM_REASONS.includes(r));

export function cleanTtn(raw: string): string {
  return raw.replace(/\s+/g, "");
}

export function ttnLooksWrong(needsTtn: boolean, ttnClean: string): boolean {
  return needsTtn && ttnClean.length > 0 && !isNovaPoshtaTtn(ttnClean);
}

export interface StatusFormState {
  hasOrder: boolean;
  needsTtn: boolean;
  ttnClean: string;
  needsReason: boolean;
  code: RejectReasonCode | null;
  reason: string;
}

/** The confirm button stays disabled until the transition has what it needs. */
export function isStatusInvalid(s: StatusFormState): boolean {
  const reasonMissing = s.needsReason && (!s.code || (s.code === "OTHER" && !s.reason.trim()));
  return !s.hasOrder || (s.needsTtn && !s.ttnClean) || reasonMissing;
}

export function buildStatusPayload(a: {
  target: OrderStatus;
  ttnClean: string;
  code: RejectReasonCode | null;
  reason: string;
  restock: boolean;
  inTransit: boolean;
  shippedReject: boolean;
}): StatusChangeBody {
  const needsTtn = a.target === "SHIPPED";
  const needsReason = a.target === "REJECTED";
  return {
    status: a.target,
    trackingNumber: needsTtn ? a.ttnClean : undefined,
    rejectReasonCode: needsReason && a.code ? a.code : undefined,
    rejectReason: needsReason && a.reason.trim() ? a.reason.trim() : undefined,
    restock: needsReason && !(a.shippedReject && a.inTransit) ? a.restock : undefined,
    returnInTransit: a.shippedReject ? a.inTransit : undefined,
  };
}

/** What happens to the money of a rejected SHIPPED order: the prepayment stays as the delivery fee. */
export function heldMoneyKind(received: number, prepay: number | undefined): "held" | "over" | "unknown" {
  if (prepay != null && prepay > 0 && received <= prepay) return "held";
  if (prepay != null && received > prepay) return "over";
  return "unknown";
}
