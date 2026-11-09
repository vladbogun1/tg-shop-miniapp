"use client";

/**
 * «Требует внимания»: стек условных блоков — метка «проблемный покупатель», причина отказа, запрос отмены, доплата, «посылка едет назад», архив,
 * связи заказов (обмен / слияние). Каждый показывается только по своему правилу и несёт свою кнопку.
 * Срок оплаты и счета — в «Оплате» (рядом с «Обновить статус») и в шапке карточки.
 */
import type { AdminOrderDetail } from "../../api";
import { CancelRequestBlock } from "./CancelRequestBlock";
import { OrderLinkBanners } from "./OrderLinkBanners";
import { ProblemCustomer, RejectReason } from "./OrderOutcome";
import { TopUpBlock } from "./TopUpBlock";
import type { DetailHandlers } from "./types";

export function AttentionStack({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  return (
    <>
      <ProblemCustomer order={order} />
      <RejectReason order={order} />
      <CancelRequestBlock order={order} onChanged={h.onPaymentChanged} />
      <TopUpBlock order={order} onChanged={h.onPaymentChanged} />
      <OrderLinkBanners order={order} h={h} />
    </>
  );
}
