import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { type NpWarehouse } from "@shop/core/types";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { warehouseFitsTab, type DeliveryTab } from "@shop/customer/delivery/tabs";
import type { DeliveryDraftState } from "@shop/customer/delivery/use-delivery-draft";
import { useNpMapPick } from "@shop/customer/delivery/use-np-delivery";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { CitySearch, WarehouseSearch } from "./CitySearch";
import { CourierFields, EstimateLine, MapPickConfirm } from "./DeliveryParts";
import { DeliveryTabs, NpModeSwitch, type NpPickMode } from "./DeliveryTabs";
import { Section } from "./parts";

function MapLoading() {
  const { t } = useI18n();
  return (
    <div className="shimmer grid h-[420px] place-items-center rounded-[var(--r-card)] font-display text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
      {t("checkout.mapLoading")}
    </div>
  );
}

// Карта — только по «Обрати на карті»: её код (Leaflet) не грузится, пока покупатель вводит вручную.
const NpWarehouseMap = dynamic(() => import("./NpWarehouseMap"), { ssr: false, loading: MapLoading });

function npLabel(w: NpWarehouse, t: (k: MessageKey, p?: Record<string, string | number>) => string): string {
  const cat = t(w.category === "POSTOMAT" ? "np.type.postomat" : w.category === "POINT" ? "np.type.point" : "np.type.branch");
  return w.number != null ? `${cat} ${t("np.number", { n: w.number })}` : cat;
}

interface Props {
  /** Вкладка, город, точка, адрес курьера — @shop/customer/delivery/use-delivery-draft. */
  d: DeliveryDraftState;
  tabs: readonly DeliveryTab[];
  /** Была попытка оформить: показать, чего не хватает. */
  touched: boolean;
  estimate: { estimate: NpEstimateResponse | null; loading: boolean };
  currency: string;
  /** Часть суммы платят при получении (подсказка цены упоминает комиссию за перевод). */
  payOnDelivery: boolean;
}

export function DeliverySection({ d, tabs, touched, estimate, currency, payOnDelivery }: Props) {
  const { t } = useI18n();
  const { tab } = d;
  return (
    <Section id="co-delivery" n={2} title={t("checkout.delivery")}>
      <DeliveryTabs tabs={tabs} value={tab} onChange={d.chooseTab} />
      {(tab === "WAREHOUSE" || tab === "POSTOMAT") && <PointPicker d={d} tab={tab} touched={touched} />}
      {tab === "DOORS" && (
        <div className="mt-5">
          <CourierFields city={d.np.city} onCity={d.chooseCity} courier={d.courier} onCourier={d.setCourier} showErrors={touched} />
        </div>
      )}
      {tab === "PICKUP" ? (
        <p className="mt-5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[14px] font-medium leading-relaxed text-[var(--ink)]">
          {t("checkout.pickupText")}
        </p>
      ) : (
        <div className="mt-4">
          <EstimateLine estimate={estimate.estimate} loading={estimate.loading} currency={currency} onDelivery={payOnDelivery} />
        </div>
      )}
    </Section>
  );
}

/** Відділення или поштомат: поля по умолчанию, карта — по переключателю; точку с карты надо подтвердить. */
function PointPicker({ d, tab, touched }: { d: DeliveryDraftState; tab: "WAREHOUSE" | "POSTOMAT"; touched: boolean }) {
  const { t } = useI18n();
  const { warehouse, warehouseFromLast } = d.np;
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  // Точка из прошлого заказа — компактная карточка до «Обрати інше».
  const collapsed = !!warehouse && warehouseFromLast && !editingWarehouse;
  const fits = !!warehouse && warehouseFitsTab(warehouse, tab);

  return (
    <div className="mt-5 flex flex-col gap-4">
      {warehouse && collapsed ? (
        <LastWarehouseCard
          warehouse={warehouse}
          onChange={() => {
            setEditingWarehouse(true);
            d.np.focusWarehouse(warehouse);
          }}
        />
      ) : (
        <PointFields d={d} tab={tab} />
      )}
      {warehouse && warehouseFromLast && editingWarehouse && (
        <Button type="button" variant="surface" size="sm" onClick={() => setEditingWarehouse(false)} className="self-start">
          {t("common.cancel")}
        </Button>
      )}
      {tab === "POSTOMAT" && <p className="text-[13px] font-medium text-[var(--muted)]">{t("delivery.postomat.limit")}</p>}
      {touched && !fits && (
        <p className="text-[13px] font-medium text-[var(--danger)]">{t(tab === "POSTOMAT" ? "delivery.postomat.required" : "checkout.warehouseRequired")}</p>
      )}
    </div>
  );
}

/** Город и точка: поля (по умолчанию) или карта; нажатая на карте точка ждёт «Обрати це відділення». */
function PointFields({ d, tab }: { d: DeliveryDraftState; tab: "WAREHOUSE" | "POSTOMAT" }) {
  const { t } = useI18n();
  const { city, warehouse, focus } = d.np;
  const [mode, setMode] = useState<NpPickMode>("text");
  const pick = useNpMapPick(warehouse, d.chooseWarehouse);
  return (
    <>
      <NpModeSwitch mode={mode} onChange={setMode} />
      <CitySearch city={city} onCity={d.chooseCity} />
      {mode === "text" && city && (
        <WarehouseSearch key={`${city.ref}-${tab}`} city={city} warehouse={warehouse} onWarehouse={d.chooseWarehouse} label={(w) => npLabel(w, t)} tab={tab} />
      )}
      {mode === "map" && (
        <>
          <p className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.mapHint")}</p>
          <NpWarehouseMap focus={focus} selected={pick.shown} onSelect={pick.pick} />
          {pick.pending && <MapPickConfirm warehouse={pick.pending} label={npLabel(pick.pending, t)} onConfirm={pick.confirm} onCancel={pick.cancel} />}
        </>
      )}
    </>
  );
}

function LastWarehouseCard({ warehouse, onChange }: { warehouse: NpWarehouse; onChange: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
        <MapPin className="h-5 w-5 text-[var(--accent-hi)]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--ink)]">
          {npLabel(warehouse, t)}
          <span className="ml-2 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 align-middle font-display text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
            {t("checkout.lastWarehouse")}
          </span>
        </p>
        <p className="break-words text-[13px] font-medium text-[var(--muted)]">
          {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
          {warehouse.description}
        </p>
      </div>
      <Button type="button" variant="surface" size="sm" onClick={onChange}>
        {t("checkout.changeWarehouse")}
      </Button>
    </div>
  );
}
