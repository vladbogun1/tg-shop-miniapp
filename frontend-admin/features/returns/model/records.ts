/** Тексты и суммы истории возвратов — чистые функции по записям `ReturnRecordDto`. */
import type { ReturnOrder, ReturnRecord, ReturnRecordLine } from "./types";

/** Что вернувшая запись сделала со строкой, словами. */
export function lineDone(l: ReturnRecordLine): string {
  if (l.outcome === "KEPT") return "оставили покупателю";
  if (l.outcome === "RESTOCK") return "вернулся на склад";
  if (l.outcome === "DEFECT") return "брак, списан";
  const parts: string[] = [];
  if (l.pendingQty > 0) parts.push(`едет назад: ${l.pendingQty}`);
  if (l.restockedQty > 0) parts.push(`на склад: ${l.restockedQty}`);
  if (l.defectQty > 0) parts.push(`брак: ${l.defectQty}`);
  return parts.join(" · ") || "отправил почтой";
}

/** Что сделает отмена со строкой (null — строка у покупателя, ничего не меняем). */
export function lineUndo(l: ReturnRecordLine): string | null {
  if (l.outcome === "KEPT") return null;
  const parts: string[] = [];
  if (l.pendingQty > 0) parts.push(`${l.pendingQty} шт ещё в пути — просто вернутся в заказ`);
  if (l.restockedQty > 0) parts.push(`${l.restockedQty} шт заберём со склада`);
  if (l.defectQty > 0) parts.push(`${l.defectQty} шт уберём из брака`);
  return parts.join(", ");
}

/** Деньги, реально ушедшие покупателю по записи (возврат через monobank считается, когда подтверждён). */
export function givenBack(rec: ReturnRecord, order: ReturnOrder): number {
  return Math.min(rec.refundMinor + rec.monoRefundMinor, order.refundedMinor ?? rec.refundMinor + rec.monoRefundMinor);
}
