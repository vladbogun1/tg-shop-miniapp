"use client";

/**
 * Courier address and the «≈ N ₴» line of the delivery step (checkout v2). The rules (validation, the estimate)
 * are @shop/customer/delivery — the website's too; only the look is the Mini App's.
 */
import { Loader2 } from "lucide-react";
import type { NpCity } from "@shop/core/types";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { estimateAmounts } from "@shop/customer/delivery/estimate";
import { courierErrors, type CourierAddress } from "@shop/customer/delivery/recipient";
import { Input } from "@shop/ui/primitives";
import { CitySearch, StreetSearch } from "@/features/checkout/ui/NpSearch";
import { useT } from "@/i18n/context";
import { money } from "@/lib/money";

/** City (the same field as for the points), street (search or by hand), building, flat / office. */
export function CourierFields({
  city,
  onCity,
  courier,
  onCourier,
  showErrors,
}: {
  city: NpCity | null;
  onCity: (c: NpCity | null) => void;
  courier: CourierAddress;
  onCourier: (c: CourierAddress) => void;
  showErrors: boolean;
}) {
  const t = useT();
  const err = courierErrors(courier);
  const buildingBad = showErrors && err.building;
  return (
    <div className="flex flex-col gap-3">
      <CitySearch city={city} onCity={onCity} />
      {showErrors && !city && <p className="px-0.5 text-[12px] font-bold text-[var(--danger)]">{t("delivery.courier.needCity")}</p>}
      <StreetSearch city={city} street={{ ref: courier.streetRef, name: courier.streetName }} onStreet={(s) => onCourier({ ...courier, streetRef: s.ref, streetName: s.name })} />
      {showErrors && err.street && <p className="-mt-1 px-0.5 text-[12px] font-bold text-[var(--danger)]">{t("delivery.courier.streetError")}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t("delivery.courier.building")}
          value={courier.building}
          onChange={(e) => onCourier({ ...courier, building: e.target.value })}
          status={buildingBad ? "danger" : undefined}
          hint={buildingBad ? t("delivery.courier.buildingError") : undefined}
          autoComplete="off"
          maxLength={32}
        />
        <Input label={t("delivery.courier.flat")} value={courier.flat} onChange={(e) => onCourier({ ...courier, flat: e.target.value })} autoComplete="off" maxLength={32} />
      </div>
      <p className="px-0.5 text-[12px] font-medium text-[var(--muted)]">{t("delivery.courier.hint")}</p>
    </div>
  );
}

/**
 * «Доставка ≈ N ₴ — сплачуєте окремо Новій пошті». No number (unavailable, failed, switched off) — the neutral «за
 * тарифом Нової пошти» line. With pay-on-delivery the number already holds NP's transfer fee (the server adds it).
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
  /** Part of the sum is paid on receipt. */
  onDelivery: boolean;
}) {
  const t = useT();
  const a = estimateAmounts(estimate);
  if (!a && loading) {
    return (
      <p className="flex items-center gap-2 px-0.5 text-[12px] font-medium text-[var(--muted)]" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("delivery.estimate.loading")}
      </p>
    );
  }
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3" aria-live="polite">
      <p className="text-[13px] font-semibold text-[var(--ink)]">
        {a ? t(a.withCodFee ? "delivery.estimate.lineCod" : "delivery.estimate.line", { amount: money(a.deliveryMinor, currency) }) : t("delivery.estimate.unavailable")}
      </p>
      {onDelivery && !a?.withCodFee && <p className="mt-1 text-[12px] font-medium text-[var(--muted)]">{t("delivery.estimate.cod")}</p>}
    </div>
  );
}
