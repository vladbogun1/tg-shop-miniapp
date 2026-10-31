"use client";

import { Store, Truck, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import type { NpCity } from "@shop/core/types";
import { Button } from "@shop/ui/primitives";
import { CitySearch, WarehouseSearch } from "@/components/checkout/NpSearch";
import type { MapFocus } from "@/components/checkout/NpWarehouseMap";
import { useT } from "@/i18n/context";
import type { DeliveryMethod, NpWarehouse } from "@/lib/api";
import { type NpMode, npLabel } from "../model/np-label";
import { DeliveryTab, NpModeSwitch, WarehouseCard } from "./delivery-parts";

/** Leaflet map is client-only (touches window) → load without SSR. */
function MapLoading() {
  const t = useT();
  return (
    <div
      className="flex items-center justify-center rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold font-display uppercase tracking-[0.08em] text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]"
      style={{ height: 320 }}
    >
      {t("checkout.delivery.mapLoading")}
    </div>
  );
}

const NpWarehouseMap = dynamic(() => import("@/components/checkout/NpWarehouseMap"), {
  ssr: false,
  loading: MapLoading,
});

export function DeliveryStep({
  delivery,
  setDelivery,
  city,
  onCity,
  warehouse,
  onWarehouse,
  fromLast,
  onChangeLast,
  mode,
  setMode,
  focus,
  comment,
  setComment,
  touched,
}: {
  delivery: DeliveryMethod;
  setDelivery: (d: DeliveryMethod) => void;
  city: NpCity | null;
  onCity: (c: NpCity | null) => void;
  warehouse: NpWarehouse | null;
  onWarehouse: (w: NpWarehouse | null) => void;
  /** The branch is the last order's one — shown as a card until "Обрати інше". */
  fromLast: boolean;
  onChangeLast: () => void;
  mode: NpMode;
  setMode: (m: NpMode) => void;
  focus: MapFocus | null;
  comment: string;
  setComment: (v: string) => void;
  touched: boolean;
}) {
  const t = useT();
  const collapsed = !!warehouse && fromLast;

  return (
    <div className="flex flex-col gap-3">
      {/* 2 tabs */}
      <div className="grid grid-cols-2 gap-2.5">
        <DeliveryTab
          active={delivery === "NOVA_POSHTA"}
          onClick={() => setDelivery("NOVA_POSHTA")}
          icon={<Truck className="h-5 w-5" />}
          title={t("checkout.delivery.np")}
          subtitle={t("checkout.delivery.npSubtitle")}
        />
        <DeliveryTab
          active={delivery === "PICKUP"}
          onClick={() => setDelivery("PICKUP")}
          icon={<Store className="h-5 w-5" />}
          title={t("checkout.delivery.pickup")}
          subtitle={t("checkout.delivery.pickupSubtitle")}
        />
      </div>

      {delivery === "NOVA_POSHTA" &&
        (collapsed && warehouse ? (
          <WarehouseCard
            warehouse={warehouse}
            badge={t("checkout.np.lastWarehouse")}
            action={
              <Button
                variant="surface"
                onClick={onChangeLast}
                icon={<MapPin className="h-4 w-4" strokeWidth={2.5} />}
              >
                {t("checkout.np.changeLast")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <NpModeSwitch mode={mode} setMode={setMode} />
            {mode === "text" ? (
              <>
                <CitySearch city={city} onCity={onCity} />
                {city && (
                  <WarehouseSearch
                    key={city.ref}
                    city={city}
                    warehouse={warehouse}
                    onWarehouse={onWarehouse}
                    label={(w) => npLabel(w, t)}
                  />
                )}
              </>
            ) : (
              <>
                <p className="px-0.5 text-[13px] text-[var(--muted)]">
                  {t("checkout.delivery.mapHint")}
                </p>
                <NpWarehouseMap focus={focus} selected={warehouse} onSelect={onWarehouse} />
                {warehouse && <WarehouseCard warehouse={warehouse} />}
              </>
            )}
          </div>
        ))}

      {touched && delivery === "NOVA_POSHTA" && !warehouse && (
        <p className="px-0.5 text-[12px] font-bold text-[var(--danger)]">
          {t("checkout.delivery.required")}
        </p>
      )}

      {delivery === "PICKUP" && (
        <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-medium leading-relaxed text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]">
          {t("checkout.delivery.pickupText")}
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("checkout.delivery.comment")}
        rows={3}
        className="tap mt-1 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
    </div>
  );
}
