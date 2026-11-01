"use client";

/**
 * Сценарий «отправить заказ» — один на Mini App и сайт: защита от двойного нажатия, тело запроса,
 * заказ с ключом идемпотентности (`useCreateOrder`), отметка подарка-кейса, отклик платформы, разбор отказа
 * (промокод снят, лимиты антиспама). Что делать после успеха (корзина, аналитика, переход на страницу заказа),
 * решает приложение в `onPlaced`: адреса и сторы у приложений свои.
 */
import { useState } from "react";
import type { GiftTierInfo } from "@shop/core/giftcase";
import type { OrderLimitCode } from "@shop/core/orders";
import type { CreateOrderResult, DeliveryMethod, NpWarehouse } from "@shop/core/types";
import { markGiftCaseAutoOpen } from "@shop/ui/gift-case";
import type { Platform } from "../platform/platform";
import type { CheckoutApi } from "./api";
import { buildCreateOrderRequest, classifyOrderFailure, type OrderLineInput } from "./order-request";
import { useCreateOrder } from "./use-create-order";

type FailureT = (key: "checkout.promoDropped" | "checkout.failed", params?: Record<string, string | number>) => string;

export interface PlaceOrderInput {
  /** Только то, что можно заказать; `key` — строка корзины, которую уберёт `onPlaced`. */
  lines: (OrderLineInput & { key: string })[];
  name: string;
  phone: string;
  comment: string;
  promoCode: string;
  /** Отправляется ТОЛЬКО код, который сервер только что подтвердил. */
  promoValid: boolean;
  delivery: DeliveryMethod;
  warehouse: NpWarehouse | null;
  /** Выбранный способ оплаты (`null` — отправлять нечего). */
  payment: { id: string } | null;
  giftTier: GiftTierInfo | null;
  giftDiscount: number;
}

export interface PlaceOrderDeps {
  api: Pick<CheckoutApi, "createOrder">;
  platform: Pick<Platform, "haptic">;
  t: FailureT;
  /** Правка количества в дебаунсе должна дойти до серверной корзины ДО заказа. */
  beforePlace?: () => Promise<void>;
  /** Сервер отклонил промокод: убрать его из корзины. */
  dropPromo: () => void;
  /** Заказ создан: очистить заказанные строки, аналитика, переход. */
  onPlaced: (created: CreateOrderResult, orderedKeys: string[]) => void;
}

/** Что показать покупателю, когда создать заказ не вышло. */
export function describeFailure(e: unknown, t: FailureT): { dropPromo: boolean; message: string; limitCode: OrderLimitCode | null } {
  const failure = classifyOrderFailure(e);
  if (failure.kind === "promoRejected") {
    return { dropPromo: true, message: t("checkout.promoDropped", { message: failure.message }), limitCode: null };
  }
  if (failure.kind === "limit") return { dropPromo: false, message: failure.message, limitCode: failure.code };
  return { dropPromo: false, message: failure.message ?? t("checkout.failed"), limitCode: null };
}

export function usePlaceOrder(deps: PlaceOrderDeps, input: PlaceOrderInput) {
  const placeOrder = useCreateOrder(deps.api, deps.beforePlace);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Последний отказ — лимит антиспама (TOO_MANY_UNPAID → ссылка на «Мои заказы»). */
  const [limitCode, setLimitCode] = useState<OrderLimitCode | null>(null);
  /** Заказ создан, идёт переход на его страницу (корзина к этому моменту уже пуста). */
  const [placedId, setPlacedId] = useState<string | null>(null);

  async function submit() {
    if (submitting || placedId || !input.payment) return;
    setSubmitError(null);
    setLimitCode(null);
    setSubmitting(true);
    const { giftTier, giftDiscount } = input;
    const body = buildCreateOrderRequest({
      lines: input.lines,
      name: input.name,
      phone: input.phone,
      comment: input.comment,
      // Отклонённый сервером код не отправляется: иначе заказ вернётся 400 «invalid promo code», а убрать код
      // отсюда нельзя — покупатель застрянет. Сумма на кнопке в этом случае без скидки, так что снятие кода
      // списывает ровно показанное.
      promoCode: input.promoValid ? input.promoCode.trim() : undefined,
      delivery: input.delivery,
      warehouse: input.warehouse,
      paymentOptionId: input.payment.id,
      giftChoice: giftTier ? (giftDiscount > 0 ? "DISCOUNT" : "CASE") : undefined,
    });
    try {
      const created = await placeOrder.mutateAsync(body);
      if (giftTier && giftDiscount === 0) markGiftCaseAutoOpen(created.orderId);
      deps.platform.haptic();
      setPlacedId(created.orderId);
      deps.onPlaced(created, input.lines.map((l) => l.key));
    } catch (e) {
      // Корзина проверила код, так что отказ здесь — кто-то занял последнее использование. Снимаем код и даём
      // оформить ещё раз по цене без него, а не оставляем покупателя там, где код не поправить.
      const failure = describeFailure(e, deps.t);
      if (failure.dropPromo) deps.dropPromo();
      setSubmitError(failure.message);
      setLimitCode(failure.limitCode);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submit,
    /** Идёт запрос или переход на страницу заказа: кнопка остаётся выключенной до ухода с экрана. */
    submitting: submitting || placedId !== null,
    submitError,
    setSubmitError,
    limitCode,
    placedId,
  };
}
