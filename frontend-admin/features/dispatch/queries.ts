"use client";

import { inboxKeys } from "@/features/inbox";
import { changeStatusConfirmingUnpaid, orderApi, orderKeys } from "@/features/order";
import { QUERY_PRESETS } from "@shop/core/query";
import { useConfirm } from "@shop/ui/confirm";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";

/** Тот же опрос раз в 30 с, что у пресета live; staleTime — по умолчанию клиента (как раньше). */
const REFETCH_MS = QUERY_PRESETS.live.refetchInterval;

/** Every order ready to go out. Lives in the screen (the parent), not in a card that can unmount. */
export function useDispatchOrders() {
  return useQuery({
    queryKey: orderKeys.dispatch(),
    queryFn: () => orderApi.dispatch(true),
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

/** «Карточки в Telegram». */
export function useBroadcastDispatch() {
  return useApiMutation({
    mutationFn: () => orderApi.dispatchBroadcast(),
    success: ({ posted }) => (posted > 0 ? `Добавлено в Telegram: ${posted}` : "Все карточки уже в Telegram"),
    errorFallback: "Ошибка отправки",
  });
}

/**
 * «Отправлено» с ТТН. Approved order without its online payment asks «Отправить всё равно?» (server:
 * ORDER_UNPAID_SHIP): `null` — человек отказался, ничего не меняем.
 */
export function useShipOrder(order: { id: string; shortId: string }, onShipped: () => void) {
  const confirm = useConfirm();
  return useApiMutation({
    mutationFn: (trackingNumber: string) => changeStatusConfirmingUnpaid(order.id, { status: "SHIPPED", trackingNumber }, confirm),
    success: (updated) => (updated === null ? undefined : `#${order.shortId} отправлен, ТТН ушла клиенту`),
    // «Одобрены, не отправлены» / payment rows of «Внимание» and the menu badge.
    invalidate: (updated) =>
      updated === null
        ? []
        : [orderKeys.dispatch(), orderKeys.board(), orderKeys.table(), orderKeys.detail(order.id), inboxKeys.all()],
    errorFallback: "Не удалось отметить отправку",
    onSuccess: (updated) => {
      if (updated !== null) onShipped();
    },
  });
}
