"use client";

/**
 * «Какой способ оплаты выбран» и «сколько платить сейчас» — одна копия для Mini App и сайта
 * (раньше были написаны дважды, деньги расходились бы при правке одной из них).
 *
 * Checkout v2: вариант может быть «Оплата при отриманні» (`kind: ON_DELIVERY` — онлайн 0 ₴) и может быть
 * ограничен способами доставки и суммой заказа. Старый бэкенд этих полей не шлёт — тогда всё как раньше.
 */
import { useEffect, useState } from "react";
import { visiblePaymentOptions } from "@shop/core/orders";
import type { DeliveryKey, PaymentOptionKind } from "../delivery/contract";

interface PayOption {
  id: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
  /** "ON_DELIVERY" — оплата при получении (PaymentOptionKind); сервер шлёт строку. */
  kind?: PaymentOptionKind | (string & {}) | null;
  /** DeliveryKey из сервера (строки). */
  deliveryMethods?: readonly string[] | null;
  maxTotalMinor?: number | null;
}

export function isOnDelivery(o: Pick<PayOption, "kind"> | null | undefined): boolean {
  return o?.kind === "ON_DELIVERY";
}

/**
 * Можно ли этот вариант для доставки `tab` и суммы — правила сервера: список доставок варианта (пусто — все),
 * потолок суммы, «при отриманні» только для «Нової пошти» и не для покупателя «только онлайн» (метка в админке).
 */
export function paymentOptionAllowed(o: PayOption, tab: DeliveryKey | null, totalMinor: number, onlinePaymentOnly = false): boolean {
  if (tab && o.deliveryMethods && o.deliveryMethods.length > 0 && !o.deliveryMethods.includes(tab)) return false;
  if (isOnDelivery(o) && (tab === "PICKUP" || onlinePaymentOnly)) return false;
  return !(o.maxTotalMinor != null && o.maxTotalMinor > 0 && totalMinor > o.maxTotalMinor);
}

/**
 * Варианты к показу: отфильтрованные по доставке и сумме, а среди онлайн-вариантов — правило дешёвой предоплаты
 * `visiblePaymentOptions`. Порядок сохраняется. `tab` null — доставку не учитываем.
 */
export function paymentOptionsFor<T extends PayOption>(options: T[], tab: DeliveryKey | null, totalMinor: number, onlinePaymentOnly = false): T[] {
  const allowed = options.filter((o) => paymentOptionAllowed(o, tab, totalMinor, onlinePaymentOnly));
  const online = new Set<T>(visiblePaymentOptions(allowed.filter((o) => !isOnDelivery(o)), totalMinor, onlinePaymentOnly));
  return allowed.filter((o) => isOnDelivery(o) || online.has(o));
}

/**
 * Выбранный среди видимых вариантов. Пропал (сумма упала, сменили доставку) — переходит на первый онлайн-вариант
 * с полной оплатой; молча на «при отриманні» не переключаем никогда.
 */
export function resolvePayment<T extends PayOption>(options: T[], paymentId: string | null): T | null {
  const current = options.find((p) => p.id === paymentId);
  if (current) return current;
  if (!paymentId) return null;
  return options.find((p) => !p.requiresPrepayment && !isOnDelivery(p)) ?? null;
}

/** Что покупатель платит сейчас: 0 при «при отриманні», предоплату (не больше суммы) или весь заказ. */
export function dueNowOf(chosen: PayOption | null, total: number): number {
  if (isOnDelivery(chosen)) return 0;
  return chosen?.requiresPrepayment && chosen.prepaymentMinor ? Math.min(chosen.prepaymentMinor, total) : total;
}

/** Что заберёт «Нова пошта» при получении: всё при «при отриманні», остаток после предоплаты. */
export function payOnDeliveryOf(chosen: PayOption | null, total: number): number {
  return chosen ? Math.max(0, total - dueNowOf(chosen, total)) : 0;
}

/**
 * Варианты оплаты для суммы `total` и доставки `tab`, выбранный. Выбор считается на лету (сводка не покажет
 * скрытый вариант) и дописывается в состояние, чтобы закрепиться. `switched` — выбор сменился сам
 * (прежний недоступен для этой доставки или суммы): экран говорит об этом покупателю.
 */
export function useChosenPayment<T extends PayOption>(loaded: T[] | undefined, total: number, onlinePaymentOnly = false, tab: DeliveryKey | null = null) {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  const options = paymentOptionsFor(loaded ?? [], tab, total, onlinePaymentOnly);
  const chosen = resolvePayment(options, paymentId);
  const chosenId = chosen?.id ?? null;
  const optionsLoaded = !!loaded;
  useEffect(() => {
    if (!optionsLoaded || chosenId === paymentId) return;
    if (paymentId) setSwitched(true);
    setPaymentId(chosenId);
  }, [optionsLoaded, chosenId, paymentId]);
  const choose = (id: string) => {
    setSwitched(false);
    setPaymentId(id);
  };
  return {
    options,
    chosen,
    chosenId,
    choose,
    dueNow: dueNowOf(chosen, total),
    payOnDelivery: payOnDeliveryOf(chosen, total),
    onDelivery: isOnDelivery(chosen),
    switched,
  };
}
