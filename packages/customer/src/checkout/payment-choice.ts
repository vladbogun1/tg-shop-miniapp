"use client";

/**
 * «Какой способ оплаты выбран» и «сколько платить сейчас» — одна копия для Mini App и сайта
 * (раньше были написаны дважды, деньги расходились бы при правке одной из них).
 */
import { useEffect, useState } from "react";
import { visiblePaymentOptions } from "@shop/core/orders";

interface PayOption {
  id: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
}

/**
 * Выбранный среди видимых вариантов. Вариант с предоплатой скрыт, когда весь заказ не дороже предоплаты:
 * если покупатель успел его выбрать, а сумма упала (промокод, количество), выбор переходит на первый
 * вариант с полной оплатой.
 */
export function resolvePayment<T extends PayOption>(options: T[], paymentId: string | null): T | null {
  return options.find((p) => p.id === paymentId) ?? (paymentId ? (options.find((p) => !p.requiresPrepayment) ?? null) : null);
}

/** Что покупатель платит сейчас: предоплату (не больше суммы заказа) или весь заказ. */
export function dueNowOf(chosen: PayOption | null, total: number): number {
  return chosen?.requiresPrepayment && chosen.prepaymentMinor ? Math.min(chosen.prepaymentMinor, total) : total;
}

/**
 * Варианты оплаты для суммы `total` и выбранный. Выбор считается на лету (сводка не покажет скрытый вариант)
 * и дописывается в состояние, чтобы закрепиться.
 */
export function useChosenPayment<T extends PayOption>(loaded: T[] | undefined, total: number, onlinePaymentOnly = false) {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const options = visiblePaymentOptions(loaded ?? [], total, onlinePaymentOnly);
  const chosen = resolvePayment(options, paymentId);
  const chosenId = chosen?.id ?? null;
  const optionsLoaded = !!loaded;
  useEffect(() => {
    if (optionsLoaded && chosenId !== paymentId) setPaymentId(chosenId);
  }, [optionsLoaded, chosenId, paymentId]);
  return { options, chosen, chosenId, choose: setPaymentId, dueNow: dueNowOf(chosen, total) };
}
