"use client";

/** Карточка заказа (drawer): сам заказ, обновление списков, «одно действие за раз», открытие товара и профиля. */
import { ApiError } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { productApi, type AdminProduct } from "@/features/product";
import { customerApi, type UserCardDto } from "@/features/customer";
import { orderApi, type AdminOrderDetail } from "../api";
import { orderKeys } from "../keys";

const PRODUCTS_STALE_MS = 60_000;

export function useOrderQuery(orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => orderApi.order(orderId as string),
    enabled: !!orderId,
  });
}

/** Заказ изменился: его карточка и журнал, доска, таблица, отправка и «Внимание». */
export function useRefreshOrderLists(orderId: string | null): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    if (orderId) {
      void qc.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      void qc.invalidateQueries({ queryKey: orderKeys.audit(orderId) });
    }
    void qc.invalidateQueries({ queryKey: orderKeys.board() });
    void qc.invalidateQueries({ queryKey: orderKeys.table() });
    void qc.invalidateQueries({ queryKey: orderKeys.dispatch() });
    void qc.invalidateQueries({ queryKey: orderKeys.inbox() });
  }, [qc, orderId]);
}

/** Списки других фич, которые затрагивает действие: остатки и метрики. */
export function useInvalidateStock() {
  const qc = useQueryClient();
  return {
    products: useCallback(() => void qc.invalidateQueries({ queryKey: orderKeys.products() }), [qc]),
    metrics: useCallback(() => void qc.invalidateQueries({ queryKey: orderKeys.metrics() }), [qc]),
  };
}

/** Положить свежую карточку заказа в кэш под её id (ответ обмена и слияния — другой заказ). */
export function useSetOrderCache() {
  const qc = useQueryClient();
  return useCallback((order: AdminOrderDetail) => qc.setQueryData(orderKeys.detail(order.id), order), [qc]);
}

export type OrderAction = {
  /** Что делаем; ответ — карточка заказа (или что угодно: кэш правится, только если `id` совпал). */
  fn: () => Promise<unknown>;
  okText?: string;
  errText?: string;
};

/**
 * Одно действие над заказом за раз: у кнопки свой спиннер (`busyKey`), остальные выключены.
 * `run` возвращает true при успехе. Ответ кладётся в кэш, только если это тот же заказ
 * (обмен отвечает новым). Ошибка → тост с текстом сервера.
 */
export function useOrderActionRunner(orderId: string | null) {
  const qc = useQueryClient();
  const refreshLists = useRefreshOrderLists(orderId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { mutateAsync } = useApiMutation<unknown, OrderAction>({
    mutationFn: (action) => action.fn(),
    toastOnError: false,
    onError: (e, action) => toast.error(e instanceof ApiError ? e.message : (action.errText ?? "Ошибка")),
    onSuccess: (updated, action) => {
      if (orderId && updated && typeof updated === "object" && "id" in updated && updated.id === orderId) {
        qc.setQueryData(orderKeys.detail(orderId), updated);
      }
      if (action.okText) toast.success(action.okText);
      refreshLists();
    },
  });

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, okText?: string, errText = "Ошибка"): Promise<boolean> => {
      if (!orderId) {
        toast.error("Заказ не выбран — откройте его заново");
        return false;
      }
      setBusyKey(key);
      try {
        await mutateAsync({ fn, okText, errText });
        return true;
      } catch {
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [orderId, mutateAsync],
  );
  return { busyKey, run, refreshLists };
}

/** Тап по строке состава: карточка товара поверх заказа. Архивного товара в списке нет. */
export function useOpenProductMutation(onFound: (p: AdminProduct) => void) {
  const qc = useQueryClient();
  return useApiMutation<AdminProduct | undefined, string>({
    // the same list (and cache) as «Товары»; an archived product is not in it
    mutationFn: async (productId) => {
      const all = await qc.fetchQuery({
        queryKey: orderKeys.productsActive(),
        queryFn: () => productApi.list(),
        staleTime: PRODUCTS_STALE_MS,
      });
      return all.find((x) => x.id === productId);
    },
    errorFallback: "Не удалось открыть товар",
    onSuccess: (p) => {
      if (p) onFound(p);
      else toast.error("Товар в архиве — его карточки больше нет");
    },
  });
}

/** Профиль покупателя: найденный или заготовка по данным заказа (покупателя ещё нет в списке). */
export function useOpenCustomerMutation(onFound: (u: UserCardDto) => void) {
  return useApiMutation<UserCardDto, AdminOrderDetail>({
    mutationFn: async (order) => {
      const tgId = order.tgUserId as number;
      const found = await customerApi.findUser(tgId);
      return (
        found ?? {
          telegramUserId: tgId,
          username: order.tgUsername?.replace(/^@/, "") ?? null,
          firstName: order.customerName,
          premium: false,
          botBlocked: false,
          ordersCount: 0,
          totalSpentMinor: 0,
        }
      );
    },
    errorFallback: "Не удалось открыть профиль",
    onSuccess: onFound,
  });
}
