"use client";

/**
 * "Детали" tab of the order card: customer, delivery + money, online payment (monobank), items, timeline.
 * Everything the admin types into the Nova Poshta form has a copy button; the phone is a `tel:` link.
 */
import { OnlinePaymentBlock } from "@/features/payment";
import { MoneyLedgerBlock, ReturnHistoryBlock } from "@/features/returns";
import type { AdminOrderDetail } from "../../api";
import { CancelRequestBlock } from "./CancelRequestBlock";
import { CustomerSection } from "./CustomerSection";
import { DeliverySection } from "./DeliverySection";
import { ItemsSection } from "./ItemsSection";
import { OrderLinkBanners } from "./OrderLinkBanners";
import { OrderProfitBlock } from "./OrderProfitBlock";
import { TimelineSection } from "./TimelineSection";
import type { DetailHandlers } from "./types";

export type { DetailHandlers } from "./types";

export function OrderDetails({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  return (
    <div className="flex flex-col gap-4">
      <OrderLinkBanners order={order} h={h} />
      <CustomerSection order={order} h={h} />
      <DeliverySection order={order} h={h} />
      <CancelRequestBlock order={order} onChanged={h.onPaymentChanged} />
      <OnlinePaymentBlock ref={h.paymentRef} order={order} onChanged={h.onPaymentChanged} />
      <ReturnHistoryBlock order={order} onChanged={h.onPaymentChanged} />
      <MoneyLedgerBlock order={order} onChanged={h.onPaymentChanged} />
      <OrderProfitBlock orderId={order.id} />
      <ItemsSection order={order} h={h} />
      <TimelineSection order={order} h={h} />
    </div>
  );
}
