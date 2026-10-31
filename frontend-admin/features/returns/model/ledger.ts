/** Итоги журнала денег заказа (V68). Чистые функции по строкам `MovementDto`. */
import type { OrderMovement, ReturnOrder } from "./types";

/** Сумма строк вида `kind` со знаком (поправка может быть отрицательной). */
export function sumByKind(rows: OrderMovement[], kind: OrderMovement["kind"]): number {
  return rows.filter((m) => m.kind === kind).reduce((s, m) => s + m.amountMinor, 0);
}

export interface LedgerTotals {
  paid: number;
  refunded: number;
  /** Удержано за доставку: из журнала, иначе итог заказа; 0 — строки нет. */
  retained: number;
}

export function ledgerTotals(rows: OrderMovement[], order: ReturnOrder): LedgerTotals {
  const retained = sumByKind(rows, "RETAINED");
  return {
    paid: sumByKind(rows, "PAYMENT") + sumByKind(rows, "CORRECTION"),
    refunded: sumByKind(rows, "REFUND"),
    retained: retained || (order.admin?.retainedMinor ?? 0),
  };
}

/** Отменённый возврат (V70) приходит отрицательным возвратом: деньги пришли, а не ушли. */
export function isRefundBack(m: OrderMovement): boolean {
  return m.kind === "REFUND" && m.amountMinor < 0;
}

export type LedgerTone = "faint" | "ok" | "text" | "danger";

/** Цвет суммы строки: восстановленная серая, приход зелёный, расход красный. */
export function ledgerTone(m: OrderMovement): LedgerTone {
  if (m.source === "BACKFILL") return "faint";
  const back = isRefundBack(m);
  if (m.kind === "PAYMENT" || back) return "ok";
  if (m.kind === "RETAINED") return "text";
  const negative = (m.kind === "REFUND" && !back) || m.amountMinor < 0;
  return negative ? "danger" : "text";
}

/** Знак перед суммой: «+» для прихода, «−» для возврата денег. */
export function ledgerSign(m: OrderMovement): string {
  if (m.kind === "PAYMENT" || isRefundBack(m)) return "+";
  return m.kind === "REFUND" ? "−" : "";
}
