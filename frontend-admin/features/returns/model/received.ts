/** «Посылка вернулась»: сколько единиц позиции едет назад и что уходит в тело запроса. */
import type { ReturnReceivedBody } from "../api";
import type { ReturnOrder, ReturnOrderItem } from "./types";

/**
 * Единицы в пути назад. Отказная посылка, оформленная до учёта по строкам, едет целиком
 * (весь заказ без уже вернувшегося) — поэтому для REJECTED остаток считается от количества.
 */
export function travelling(order: ReturnOrder, it: ReturnOrderItem): number {
  const anyPending = order.items.some((x) => (x.returnPendingQty ?? 0) > 0);
  if (anyPending) return it.returnPendingQty ?? 0;
  return order.status === "REJECTED" ? it.quantity - (it.returnedQty ?? 0) : 0;
}

/** Всё, что не отмечено браком, возвращается на полку; брак списывается. */
export function buildReceivedBody(
  order: ReturnOrder,
  rows: ReturnOrderItem[],
  defect: Record<number, number>,
  note: string,
): ReturnReceivedBody {
  const lines: ReturnReceivedBody["lines"] = [];
  for (const it of rows) {
    const left = travelling(order, it);
    const d = Math.min(defect[it.id!] ?? 0, left);
    if (left - d > 0) lines.push({ itemId: it.id!, quantity: left - d, outcome: "RESTOCK" });
    if (d > 0) lines.push({ itemId: it.id!, quantity: d, outcome: "DEFECT" });
  }
  return { lines, note: note.trim() || undefined };
}
