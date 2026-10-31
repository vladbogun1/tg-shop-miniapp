"use client";

/**
 * Чеки заказа: фискальные чеки продажи/возврата (Вчасно.Каса через monobank) и квитанция банка по каждому
 * оплаченному счёту. Читаются только когда деньги пришли онлайн; пока чек выпускается (или у свежей оплаты
 * его ещё нет в списке) список перечитывается раз в 20 с не дольше пяти минут (`receiptsPollMs`).
 * Скачивание и вёрстка — у приложений: Mini App отдаёт ссылки в диалог Telegram, сайт — обычные `<a download>`.
 */
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { hasOnlinePayment, receiptsPollMs, type Receipt } from "@shop/core/receipts";
import { nowMs } from "@shop/core/time";
import type { OrderDetail } from "@shop/core/types";
import { orderKeys } from "./keys";

export const RECEIPTS_STALE_MS = 30_000;

export function useReceipts(
  order: Pick<OrderDetail, "id" | "receivedMinor" | "payment">,
  fetchReceipts: (id: string) => Promise<Receipt[]>,
) {
  const enabled = hasOnlinePayment(order);
  const since = useRef(nowMs());
  const query = useQuery({
    queryKey: orderKeys.receipts(order.id),
    queryFn: () => fetchReceipts(order.id),
    enabled,
    staleTime: RECEIPTS_STALE_MS,
    refetchInterval: (q) => receiptsPollMs(q.state.data, since.current),
  });
  return { enabled, ...query };
}
