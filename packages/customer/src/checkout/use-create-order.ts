"use client";

/**
 * Создание заказа через единый способ записи (`useApiMutation`, docs/ARCHITECTURE-FRONT.md, 2.5).
 *
 * Идемпотентный ключ ведёт сам `useApiMutation` (`idempotent: true`): один ключ на попытку оформления.
 * Повтор после обрыва связи или 5xx идёт с ТЕМ ЖЕ ключом (сервер вернёт уже созданный заказ, а не второй);
 * после успеха ключ меняется. Как было на экранах (`useRef(newIdempotencyKey())`) — кроме одного места:
 * после отказа 4xx ключ тоже меняется. Сервер хранит ключ только за созданным заказом (OrderIdempotencyService),
 * поэтому для отказанного запроса «тот же» и «новый» ключ неотличимы.
 *
 * Ошибку и успех экран разбирает сам (`classifyOrderFailure`, свой переход) — тоста здесь нет.
 */
import type { CreateOrderResult } from "@shop/core/types";
import { useApiMutation, type ApiMutationConfig } from "@shop/ui/mutation";
import type { CheckoutApi, CreateOrderRequest } from "./api";

type OrderApi = Pick<CheckoutApi, "createOrder">;

/** Конфигурация мутации — отдельно от React, чтобы проверить ключ идемпотентности тестом. */
export function createOrderMutation(
  api: OrderApi,
  beforePlace?: () => Promise<void>,
): ApiMutationConfig<CreateOrderResult, CreateOrderRequest> {
  return {
    idempotent: true,
    toastOnError: false,
    mutationFn: async (body, ctx) => {
      await beforePlace?.();
      return api.createOrder(body, ctx.idempotencyKey);
    },
  };
}

export function useCreateOrder(
  api: OrderApi,
  /** Что сделать перед отправкой: правка количества в дебаунсе должна дойти до серверной корзины ДО заказа. */
  beforePlace?: () => Promise<void>,
) {
  return useApiMutation<CreateOrderResult, CreateOrderRequest>(createOrderMutation(api, beforePlace));
}
