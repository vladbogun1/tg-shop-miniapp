"use client";

/**
 * «Потрібна доплата» над перепиской: в оплаченный заказ добавили товар, а покупатель читает чат и не видит
 * карточку доплаты на странице заказа (заказ #d097e8b4, 04.11.2026). Кнопка ведёт на страницу заказа к оплате.
 */
import { CreditCard } from "lucide-react";
import { needsTopUp } from "@shop/core/orders";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { money } from "@/lib/money";

export function ChatTopUpBanner({
  order,
  onPay,
}: {
  order: OrderDetail | undefined;
  onPay: () => void;
}) {
  const { t } = useI18n();
  if (!order || !needsTopUp(order)) return null;
  const amount = money(order.amountDueMinor, order.currency);
  return (
    <div className="nb mx-3 mt-2 flex items-center gap-3 border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface))] px-3 py-2.5">
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <p className="font-semibold text-[var(--ink)]">
          {t("chat.topUp", { amount })}
        </p>
        {order.balanceOnDelivery && (
          <p className="mt-0.5 text-[var(--muted)]">{t("chat.topUpCod")}</p>
        )}
      </div>
      <Button size="sm" variant="accent" onClick={onPay} className="shrink-0">
        <CreditCard className="h-4 w-4" strokeWidth={2.25} />
        {t("pay.topUpTitle")}
      </Button>
    </div>
  );
}
