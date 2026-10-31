"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useConfirm } from "@shop/ui/confirm";
import { useApiMutation } from "@shop/ui/mutation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { changeStatusConfirmingUnpaid, orderApi, type AdminBoard, type AdminOrderDetail, type StatusChangeBody } from "../api";
import { orderKeys } from "../keys";
import { moveCard } from "../model/board";
import type { OrdersPeriod } from "../model/period";
import { STATUS_LABEL } from "../model/status";

export function boardKey(search: string, period: OrdersPeriod, closedLimit: number) {
  return [...orderKeys.board(), search, period, closedLimit] as const;
}

/**
 * Доска: самый тяжёлый запрос админки. Опрос раз в 30 с — только страховка для изменений извне
 * (другой админ, бот): свои правки инвалидируют доску сразу.
 */
export function useBoardQuery(search: string, period: OrdersPeriod, closedLimit: number) {
  return useQuery({
    queryKey: boardKey(search, period, closedLimit),
    queryFn: () => orderApi.board({ q: search || undefined, period, closedLimit }),
    refetchInterval: QUERY_PRESETS.live.refetchInterval,
    placeholderData: keepPreviousData,
  });
}

/** «Обновить»: доска, таблица и «Внимание» (смена статуса добавляет/убирает строки и бейдж меню). */
export function useRefreshOrders(): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: orderKeys.board() });
    void qc.invalidateQueries({ queryKey: orderKeys.table() });
    void qc.invalidateQueries({ queryKey: orderKeys.inbox() });
  }, [qc]);
}

interface StatusMove {
  id: string;
  payload: StatusChangeBody;
  /** Ключ доски, на которой карточка перетаскивается: её правим сразу и откатываем при отказе. */
  boardKey: ReturnType<typeof boardKey>;
}

/**
 * Смена статуса с доски: карточка переезжает сразу, при ошибке или отказе («Отправить без предоплаты?» → нет)
 * возвращается. null в результате = админ отказался.
 */
export function useBoardStatusChange() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  return useApiMutation<AdminOrderDetail | null, StatusMove>({
    mutationFn: async ({ id, payload, boardKey: key }) => {
      const prev = qc.getQueryData<AdminBoard>(key);
      if (prev) {
        const next = moveCard(prev, id, payload.status);
        if (next) qc.setQueryData(key, next);
      }
      try {
        const updated = await changeStatusConfirmingUnpaid(id, payload, confirm);
        if (updated === null && prev) qc.setQueryData(key, prev);
        return updated;
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        throw e;
      }
    },
    errorFallback: "Ошибка смены статуса",
    success: (done, v) => (done ? `Статус: ${STATUS_LABEL[v.payload.status]}` : undefined),
    invalidate: (done, v) =>
      done ? [orderKeys.board(), orderKeys.table(), orderKeys.inbox(), orderKeys.dispatch(), orderKeys.detail(v.id)] : [],
  });
}
