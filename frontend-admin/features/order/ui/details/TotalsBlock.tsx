"use client";

/** Итоги заказа: сумма, скидка, «вместо кейса», итого, при частичном выкупе на почте — «К оплате». */
import { CASE_TIER_LABEL } from "@/features/gift";
import { money } from "@/lib/money";
import { payableMinor } from "@shop/core/orders";
import type { AdminOrderDetail } from "../../api";

export function TotalsBlock({ order }: { order: AdminOrderDetail }) {
  const gift = order.gift ?? null;
  const giftDiscount = order.giftDiscountMinor ?? 0;
  return (
    <div className="tabular mt-4 space-y-1 border-t border-[var(--line)] pt-3 text-[13px]">
      <div className="flex justify-between text-[var(--text-muted)]">
        <span>Сумма</span>
        <span>{money(order.subtotalMinor, order.currency)}</span>
      </div>
      {order.discountMinor - giftDiscount > 0 && (
        <div className="flex justify-between font-semibold text-[var(--ok)]">
          <span>Скидка{order.promoCode ? ` (${order.promoCode})` : ""}</span>
          <span>−{money(order.discountMinor - giftDiscount, order.currency)}</span>
        </div>
      )}
      {giftDiscount > 0 && (
        <div className="flex justify-between font-semibold text-[var(--ok)]">
          <span>
            🎁 Вместо кейса
            {gift?.tier ? ` (${CASE_TIER_LABEL[gift.tier].toLowerCase()})` : ""}
          </span>
          <span>−{money(giftDiscount, order.currency)}</span>
        </div>
      )}
      <div className="font-display flex items-baseline justify-between pt-0.5 text-[16px] font-bold text-[var(--ink)]">
        <span className="text-[13px] uppercase tracking-[0.06em]">Итого</span>
        <span>{money(order.totalMinor, order.currency)}</span>
      </div>
      {(order.uncollectedMinor ?? 0) > 0 && (
        <>
          <div className="flex justify-between font-semibold text-[var(--danger-ink)]">
            <span>Не выкуплено на почте</span>
            <span>−{money(order.uncollectedMinor ?? 0, order.currency)}</span>
          </div>
          <div className="font-display flex items-baseline justify-between pt-0.5 text-[16px] font-bold text-[var(--ink)]">
            <span className="text-[13px] uppercase tracking-[0.06em]">К оплате</span>
            <span>{money(payableMinor(order), order.currency)}</span>
          </div>
        </>
      )}
    </div>
  );
}
