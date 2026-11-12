"use client";

/**
 * Режим «Обрати на карті» (checkout v2): карта отделений и подтверждение нажатой точки — отдельный чанк, грузится
 * только по переключателю (Leaflet и всё вокруг не нужны, пока покупатель вводит вручную).
 */
import { Check, MapPin } from "lucide-react";
import type { NpWarehouse } from "@shop/core/types";
import type { DeliveryDraftState } from "@shop/customer/delivery/use-delivery-draft";
import { useNpMapPick } from "@shop/customer/delivery/use-np-delivery";
import { Button } from "@shop/ui/primitives";
import { useCheckoutT } from "@/i18n/checkout";
import NpWarehouseMap from "./NpWarehouseMap";

export default function PointMap({ d, tab, label }: { d: DeliveryDraftState; tab: "WAREHOUSE" | "POSTOMAT"; label: (w: NpWarehouse) => string }) {
  const t = useCheckoutT();
  const pick = useNpMapPick(d.np.warehouse, d.chooseWarehouse);
  return (
    <>
      <p className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.mapHint")}</p>
      <NpWarehouseMap key={tab} focus={d.np.focus} selected={pick.shown} onSelect={pick.pick} initialCategory={tab === "POSTOMAT" ? "postomat" : "all"} />
      {pick.pending && <MapPickConfirm warehouse={pick.pending} label={label(pick.pending)} onConfirm={pick.confirm} onCancel={pick.cancel} />}
    </>
  );
}

/** Точка, нажатая на карте и ждущая «Обрати це відділення» (случайное касание не меняет адрес). */
function MapPickConfirm({ warehouse, label, onConfirm, onCancel }: { warehouse: NpWarehouse; label: string; onConfirm: () => void; onCancel: () => void }) {
  const t = useCheckoutT();
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

