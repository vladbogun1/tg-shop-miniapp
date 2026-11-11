"use client";

import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { warehouseFitsTab, type DeliveryTab } from "@shop/customer/delivery/tabs";
import type { DeliveryDraftState } from "@shop/customer/delivery/use-delivery-draft";
import { Button } from "@shop/ui/primitives";
import { CitySearch, WarehouseSearch } from "@/features/checkout/ui/NpSearch";
import { useT } from "@/i18n/context";
import { type NpMode, npLabel } from "../model/np-label";
import { CourierFields, EstimateLine } from "./courier-parts";
import { DeliveryTabs, NpModeSwitch, WarehouseCard } from "./delivery-parts";

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

const NpWarehouseMap = dynamic(() => import("@/features/checkout/ui/NpWarehouseMap"), {
  ssr: false,
  loading: MapLoading,
});

/**
 * Step 2 (checkout v2): відділення · поштомат · кур'єр · самовивіз. The point is picked by text by default or on
 * the map (the pin's sheet has its own «Обрати це відділення»); the courier gets street + building + flat. The state and the rules
 * are shared with the site (@shop/customer/delivery).
 */
export function DeliveryStep({
  d,
  tabs,
  mode,
  setMode,
  estimate,
  currency,
  payOnDelivery,
  comment,
  setComment,
  touched,
}: {
  d: DeliveryDraftState;
  tabs: readonly DeliveryTab[];
  mode: NpMode;
  setMode: (m: NpMode) => void;
  estimate: { estimate: NpEstimateResponse | null; loading: boolean };
  currency: string;
  /** Part of the sum is paid on receipt (the estimate then holds NP's transfer fee). */
  payOnDelivery: boolean;
  comment: string;
  setComment: (v: string) => void;
  touched: boolean;
}) {
  const t = useT();
  const { tab } = d;
  return (
    <div className="flex flex-col gap-3">
      <DeliveryTabs tabs={tabs} value={tab} onChange={d.chooseTab} />

      {(tab === "WAREHOUSE" || tab === "POSTOMAT") && <PointPicker d={d} tab={tab} mode={mode} setMode={setMode} touched={touched} />}
      {tab === "DOORS" && <CourierFields city={d.np.city} onCity={d.chooseCity} courier={d.courier} onCourier={d.setCourier} showErrors={touched} />}

      {tab === "PICKUP" ? (
        <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[13px] font-medium leading-relaxed text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]">
          {t("checkout.delivery.pickupText")}
        </div>
      ) : (
        <EstimateLine estimate={estimate.estimate} loading={estimate.loading} currency={currency} onDelivery={payOnDelivery} />
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("checkout.delivery.comment")}
        rows={3}
        maxLength={1000}
        className="tap mt-1 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
    </div>
  );
}

/** Відділення or поштомат: the last order's point as a card until «Обрати інше», otherwise text / map. */
function PointPicker({
  d,
  tab,
  mode,
  setMode,
  touched,
}: {
  d: DeliveryDraftState;
  tab: "WAREHOUSE" | "POSTOMAT";
  mode: NpMode;
  setMode: (m: NpMode) => void;
  touched: boolean;
}) {
  const t = useT();
  const { warehouse, warehouseFromLast } = d.np;
  const [editing, setEditing] = useState(false);
  const collapsed = !!warehouse && warehouseFromLast && !editing;
  const fits = !!warehouse && warehouseFitsTab(warehouse, tab);
  return (
    <div className="flex flex-col gap-3">
      {warehouse && collapsed ? (
        <WarehouseCard
          warehouse={warehouse}
          badge={t("checkout.np.lastWarehouse")}
          action={
            <Button variant="surface" onClick={() => {
                d.np.touched.current = true;
                setEditing(true);
              }} icon={<MapPin className="h-4 w-4" strokeWidth={2.5} />}>
              {t("checkout.np.changeLast")}
            </Button>
          }
        />
      ) : (
        <PointFields d={d} tab={tab} mode={mode} setMode={setMode} />
      )}
      {tab === "POSTOMAT" && <p className="px-0.5 text-[12px] font-medium text-[var(--muted)]">{t("delivery.postomat.limit")}</p>}
      {touched && !fits && (
        <p className="px-0.5 text-[12px] font-bold text-[var(--danger)]">{t(tab === "POSTOMAT" ? "delivery.postomat.required" : "checkout.delivery.required")}</p>
      )}
    </div>
  );
}

/** City → point by text, or the map (a pin opens a sheet with «Обрати це відділення» — that is the confirmation). */
function PointFields({ d, tab, mode, setMode }: { d: DeliveryDraftState; tab: "WAREHOUSE" | "POSTOMAT"; mode: NpMode; setMode: (m: NpMode) => void }) {
  const t = useT();
  const { city, warehouse, focus } = d.np;
  return (
    <>
      <NpModeSwitch mode={mode} setMode={setMode} />
      {mode === "text" ? (
        <>
          <CitySearch city={city} onCity={d.chooseCity} />
          {city && (
            <WarehouseSearch key={`${city.ref}-${tab}`} city={city} warehouse={warehouse} onWarehouse={d.chooseWarehouse} label={(w) => npLabel(w, t)} tab={tab} />
          )}
        </>
      ) : (
        <>
          <p className="px-0.5 text-[13px] text-[var(--muted)]">{t("checkout.delivery.mapHint")}</p>
          <NpWarehouseMap key={tab} focus={focus} selected={warehouse} onSelect={d.chooseWarehouse} initialCategory={tab === "POSTOMAT" ? "postomat" : "all"} />
          {warehouse && <WarehouseCard warehouse={warehouse} />}
        </>
      )}
    </>
  );
}
