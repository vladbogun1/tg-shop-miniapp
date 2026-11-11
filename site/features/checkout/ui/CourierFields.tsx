"use client";

/**
 * Курьер (checkout v2): город, улица (поиск по /api/np/streets или вручную), дом, квартира/офис. Отдельный чанк —
 * грузится только на вкладке «Кур'єр» (бюджет бандла /checkout).
 */
import { Route } from "lucide-react";
import type { NpCity } from "@shop/core/types";
import type { NpStreet } from "@shop/customer/delivery/contract";
import { courierErrors, type CourierAddress } from "@shop/customer/delivery/recipient";
import { useNpStreets } from "@shop/customer/delivery/use-np-delivery";
import { Input } from "@shop/ui/primitives";
import { useI18n, useT } from "@/i18n/context";
import { api } from "@/lib/api";
import { CitySearch } from "./CitySearch";
import { NpCombobox } from "./NpCombobox";

const np = api.checkout;

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
 * Улица для курьера: подсказки по /api/np/streets выбранного города; не нашлась или поиск упал — улицу можно
 * вписать руками (ref пустой, сервер передаст как есть).
 */
const streetLabel = (s: NpStreet) => (s.type ? `${s.type} ${s.name}` : s.name);

export function StreetSearch({
  city,
  street,
  onStreet,
  error,
}: {
  city: NpCity | null;
  street: { ref: string; name: string };
  onStreet: (s: { ref: string; name: string }) => void;
  error?: string;
}) {
  const t = useT();
  const found = useNpStreets(np, city?.ref, street.name, !!city && !street.ref);
  return (
    <div className="flex flex-col gap-1.5">
      <NpCombobox<NpStreet>
        label={t("delivery.courier.street")}
        placeholder={city ? t("delivery.courier.streetPlaceholder") : t("delivery.courier.needCity")}
        icon={<Route className="h-4 w-4" strokeWidth={2.25} />}
        value={street.name}
        onText={(v) => onStreet({ ref: "", name: v })}
        items={found.items}
        itemKey={(s) => s.ref}
        listOpen={found.searching}
        loading={found.loading}
        emptyText={found.failed ? t("delivery.courier.streetFailed") : t("delivery.courier.streetNone")}
        inputMode="text"
        onPick={(s) => onStreet({ ref: s.ref, name: streetLabel(s) })}
        renderItem={(s) => (
          <span className="text-[14px] font-medium text-[var(--ink)]">{streetLabel(s)}</span>
        )}
      />
      {error && <p className="text-[13px] font-medium text-[var(--danger)]">{error}</p>}
    </div>
  );
}
