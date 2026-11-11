"use client";

/**
 * Часть блока доставки сайта (checkout v2): строка «≈ N ₴».
 * Правила (проверки, подсказка цены) — @shop/customer/delivery, те же, что в Mini App; здесь только вид сайта.
 */
import { Loader2 } from "lucide-react";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { estimateAmounts } from "@shop/customer/delivery/estimate";
import { useCheckoutT } from "@/i18n/checkout";
import { useFmt } from "@/lib/use-fmt";

/**
 * «Доставка ≈ N ₴ — сплачуєте окремо Новій пошті». Нет цифры (недоступно, сбой, выключено) — нейтральная строка
 * «за тарифом Нової пошти». При оплате при получении цифра уже с комиссией за перевод (её складывает сервер);
 * без цифры комиссия упоминается отдельной строкой.
 */
export function EstimateLine({
  estimate,
  loading,
  currency,
  onDelivery,
}: {
  estimate: NpEstimateResponse | null;
  loading: boolean;
  currency: string;
  /** Часть суммы платят при получении. */
  onDelivery: boolean;
}) {
  const t = useCheckoutT();
  const fmt = useFmt();
  const a = estimateAmounts(estimate);
  if (!a && loading) {
    return (
      <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--muted)]" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("delivery.estimate.loading")}
      </p>
    );
  }
  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3" aria-live="polite">
      <p className="text-[14px] font-semibold text-[var(--ink)]">
        {a
          ? t(a.withCodFee ? "delivery.estimate.lineCod" : "delivery.estimate.line", { amount: fmt.money(a.deliveryMinor, currency) })
          : t("delivery.estimate.unavailable")}
      </p>
      {onDelivery && !a?.withCodFee && <p className="mt-1 text-[12px] font-medium text-[var(--muted)]">{t("delivery.estimate.cod")}</p>}
    </div>
  );
}
