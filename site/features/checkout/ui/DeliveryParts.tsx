"use client";

/**
 * Части блока доставки сайта (checkout v2): подтверждение точки с карты, адрес курьера, строка «≈ N ₴».
 * Правила (проверки, подсказка цены) — @shop/customer/delivery, те же, что в Mini App; здесь только вид сайта.
 */
import { Check, Loader2, MapPin } from "lucide-react";
import type { NpCity, NpWarehouse } from "@shop/core/types";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { estimateAmounts } from "@shop/customer/delivery/estimate";
import { courierErrors, type CourierAddress } from "@shop/customer/delivery/recipient";
import { Button, Input } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";
import { CitySearch, StreetSearch } from "./CitySearch";

/** Точка, нажатая на карте и ждущая «Обрати це відділення» (случайное касание не меняет адрес). */
export function MapPickConfirm({ warehouse, label, onConfirm, onCancel }: { warehouse: NpWarehouse; label: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
        <MapPin className="h-5 w-5 text-[var(--accent-hi)]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--ink)]">{label}</p>
        <p className="break-words text-[13px] font-medium text-[var(--muted)]">
          {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
          {warehouse.description}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="accent" size="sm" onClick={onConfirm} icon={<Check className="h-4 w-4" strokeWidth={2.75} />}>
          {t("np.confirm")}
        </Button>
        <Button type="button" variant="surface" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

/** Курьер: город (то же поле, что у отделений), улица (поиск или вручную), дом, квартира/офис. */
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
  const { t } = useI18n();
  const err = courierErrors(courier);
  const buildingBad = showErrors && err.building;
  return (
    <div className="flex flex-col gap-4">
      <CitySearch city={city} onCity={onCity} />
      {showErrors && !city && <p className="-mt-2 text-[13px] font-medium text-[var(--danger)]">{t("delivery.courier.needCity")}</p>}
      <StreetSearch
        city={city}
        street={{ ref: courier.streetRef, name: courier.streetName }}
        onStreet={(s) => onCourier({ ...courier, streetRef: s.ref, streetName: s.name })}
        error={showErrors && err.street ? t("delivery.courier.streetError") : undefined}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label={t("delivery.courier.building")}
          value={courier.building}
          onChange={(e) => onCourier({ ...courier, building: e.target.value })}
          status={buildingBad ? "danger" : undefined}
          hint={buildingBad ? t("delivery.courier.buildingError") : undefined}
          autoComplete="off"
          maxLength={32}
          aria-invalid={buildingBad}
        />
        <Input
          label={t("delivery.courier.flat")}
          value={courier.flat}
          onChange={(e) => onCourier({ ...courier, flat: e.target.value })}
          autoComplete="off"
          maxLength={32}
        />
      </div>
      <p className="text-[13px] font-medium text-[var(--muted)]">{t("delivery.courier.hint")}</p>
    </div>
  );
}

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
  const { t } = useI18n();
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
