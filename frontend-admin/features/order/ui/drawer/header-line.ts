/** Вторая строка шапки карточки: что срочного про деньги (дедлайн оплаты, наложка) — чистые правила. */
import { codMinor, paymentState } from "@shop/core/orders";
import { formatTime, nowMs } from "@shop/core/time";
import { isOverdue, timeLeft } from "@/features/payment";
import { money } from "@/lib/money";
import type { AdminOrderDetail } from "../../api";

export interface HeaderLine {
  text: string;
  tone: "warn" | "danger" | "neutral";
}

type Source = Pick<
  AdminOrderDetail,
  | "paid"
  | "status"
  | "totalMinor"
  | "receivedMinor"
  | "uncollectedMinor"
  | "amountDueMinor"
  | "paymentDueAt"
  | "deliveryMethod"
  | "currency"
>;

/**
 * «Оплатить до 14:30 · осталось 2 ч» пока заказ ждёт оплату онлайн; иначе «Наложка N» при доставке Новой почтой.
 * Нет срочного — null (строку не рисуем).
 */
export function headerLine(order: Source, now = nowMs()): HeaderLine | null {
  if (paymentState(order) === "AWAITING" && order.paymentDueAt) {
    const due = order.paymentDueAt;
    if (isOverdue(due, now))
      return {
        text: `Оплатить до ${formatTime(due)} · просрочено`,
        tone: "danger",
      };
    const left = timeLeft(due, now);
    return {
      text: `Оплатить до ${formatTime(due)}${left ? ` · осталось ${left}` : ""}`,
      tone: "warn",
    };
  }
  const cod = codMinor(order);
  if (order.deliveryMethod === "NOVA_POSHTA" && cod > 0 && order.status !== "REJECTED") {
    return { text: `Наложка ${money(cod, order.currency)}`, tone: "neutral" };
  }
  return null;
}
