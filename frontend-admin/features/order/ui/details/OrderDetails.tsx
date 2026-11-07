"use client";

/**
 * "Детали" tab of the order card, top to bottom: status ribbon, «Требует внимания» (conditional blocks),
 * «Состав и сумма», «Получатель и доставка», «Оплата» (+ счета monobank), then the rare ones:
 * история возвратов, журнал денег и прибыль — свёрнуты, со сводкой в заголовке.
 * Everything the admin types into the Nova Poshta form has a copy button; the phone is a tel: link.
 */
import { OnlinePaymentBlock } from "@/features/payment";
import { MoneyLedgerBlock, ReturnHistoryBlock } from "@/features/returns";
import type { AdminOrderDetail } from "../../api";
import { AttentionStack } from "./AttentionStack";
import { ItemsSection } from "./ItemsSection";
import { ExchangeCards } from "./OrderOutcome";
import { OrderProfitBlock } from "./OrderProfitBlock";
import { PaymentSummary } from "./PaymentSummary";
import { RecipientSection } from "./RecipientSection";
import { StatusRibbon } from "./StatusRibbon";
import type { DetailHandlers } from "./types";

export type { DetailHandlers } from "./types";

export function OrderDetails({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  return (
    <div className="flex flex-col gap-3">
      <StatusRibbon order={order} />
      <AttentionStack order={order} h={h} />
      <ItemsSection order={order} h={h} />
      <RecipientSection order={order} h={h} />
      <PaymentSummary order={order} />
      <OnlinePaymentBlock ref={h.paymentRef} order={order} onChanged={h.onPaymentChanged} />
      <ReturnHistoryBlock order={order} onChanged={h.onPaymentChanged} />
      <ExchangeCards order={order} h={h} />
      <MoneyLedgerBlock order={order} onChanged={h.onPaymentChanged} />
      <OrderProfitBlock orderId={order.id} />
    </div>
  );
}
