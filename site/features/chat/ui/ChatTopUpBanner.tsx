"use client";

/**
 * «Потрібна доплата» над перепиской: в оплаченный заказ добавили товар (заказ #d097e8b4, 04.11.2026).
 * Чат стоит внизу страницы заказа, карточка оплаты — вверху: кнопка прокручивает к ней (#order-pay).
 */
import { CreditCard } from "lucide-react";
import { needsTopUp } from "@shop/core/orders";
import type { OrderDetail } from "@shop/core/types";
import { useT } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";

export function ChatTopUpBanner({ order }: { order: OrderDetail }) {
  const t = useT();
  const fmt = useFmt();
  if (!needsTopUp(order)) return null;
  const amount = fmt.money(order.amountDueMinor, order.currency);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface))] px-4 py-2.5">
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p className="font-semibold text-[var(--ink)]">
          {t("chat.topUp", { amount })}
        </p>
        {order.balanceOnDelivery && (
          <p className="mt-0.5 text-[var(--muted)]">{t("chat.topUpCod")}</p>
        )}
      </div>
      <a
        href="#order-pay"
        className="chamfer inline-flex shrink-0 items-center gap-1.5 bg-[var(--accent)] px-3.5 py-2 font-display text-[12px] font-bold uppercase tracking-[.08em] text-[var(--accent-ink)] [--chamfer:7px] hover:bg-[var(--accent-hi)]"
      >
        <CreditCard className="h-4 w-4" strokeWidth={2.25} />
        {t("pay.topUpTitle")}
      </a>
    </div>
  );
}
