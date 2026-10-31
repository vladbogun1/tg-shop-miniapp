import { MapPin, Store, Truck } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { type DeliveryMethod, type NpWarehouse } from "@shop/core/types";
import { type useNpSelection } from "@shop/customer/delivery/np-selection";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { CitySearch, WarehouseSearch } from "./CitySearch";
import { Section } from "./parts";

function MapLoading() {
  const { t } = useI18n();
  return (
    <div className="shimmer grid h-[420px] place-items-center rounded-[var(--r-card)] font-display text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
      {t("checkout.mapLoading")}
    </div>
  );
}

const NpWarehouseMap = dynamic(() => import("./NpWarehouseMap"), { ssr: false, loading: MapLoading });

function npLabel(w: NpWarehouse, t: (k: MessageKey, p?: Record<string, string | number>) => string): string {
  const cat = t(w.category === "POSTOMAT" ? "np.type.postomat" : w.category === "POINT" ? "np.type.point" : "np.type.branch");
  return w.number != null ? `${cat} ${t("np.number", { n: w.number })}` : cat;
}

interface Props {
  delivery: DeliveryMethod;
  onDelivery: (d: DeliveryMethod) => void;
  /** City / branch / map focus — @shop/customer/delivery/np-selection. */
  np: ReturnType<typeof useNpSelection>;
  /** The submit was attempted: show "pick a branch". */
  touched: boolean;
}

export function DeliverySection({ delivery, onDelivery, np, touched }: Props) {
  const { t } = useI18n();
  const { city, warehouse, focus, warehouseFromLast, chooseCity, chooseWarehouse } = np;
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  // The last order's branch shows as a compact card until "Обрати інше"; a branch picked here keeps
  // the fields and the map open, so it can be changed in place.
  const collapsed = !!warehouse && warehouseFromLast && !editingWarehouse;
  const showMap = delivery === "NOVA_POSHTA" && !collapsed;

  return (
    <Section id="co-delivery" n={2} title={t("checkout.delivery")}>
      <div role="tablist" aria-label={t("checkout.delivery")} className="grid grid-cols-2 gap-3">
        <DeliveryTab
          active={delivery === "NOVA_POSHTA"}
          onClick={() => onDelivery("NOVA_POSHTA")}
          icon={<Truck className="h-5 w-5" strokeWidth={2.5} />}
          title={t("checkout.np")}
          subtitle={t("checkout.npSubtitle")}
        />
        <DeliveryTab
          active={delivery === "PICKUP"}
          onClick={() => onDelivery("PICKUP")}
          icon={<Store className="h-5 w-5" strokeWidth={2.5} />}
          title={t("checkout.pickup")}
          subtitle={t("checkout.pickupSubtitle")}
        />
      </div>

      {delivery === "NOVA_POSHTA" && (
        <div className="mt-5 flex flex-col gap-4">
          {warehouse && collapsed && (
            <LastWarehouseCard
              warehouse={warehouse}
              fromLast={warehouseFromLast}
              onChange={() => {
                setEditingWarehouse(true);
                np.focusWarehouse(warehouse);
              }}
            />
          )}
          {showMap && (
            <>
              <CitySearch city={city} onCity={chooseCity} />
              {city && (
                <WarehouseSearch
                  key={city.ref}
                  city={city}
                  warehouse={warehouse}
                  onWarehouse={chooseWarehouse}
                  label={(w) => npLabel(w, t)}
                />
              )}
              <p className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.mapHint")}</p>
              <NpWarehouseMap focus={focus} selected={warehouse} onSelect={chooseWarehouse} />
              {warehouse && warehouseFromLast && (
                <Button type="button" variant="surface" size="sm" onClick={() => setEditingWarehouse(false)} className="self-start">
                  {t("common.cancel")}
                </Button>
              )}
            </>
          )}
          {touched && !warehouse && (
            <p className="text-[13px] font-medium text-[var(--danger)]">{t("checkout.warehouseRequired")}</p>
          )}
        </div>
      )}
      {delivery === "PICKUP" && (
        <p className="mt-5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[14px] font-medium leading-relaxed text-[var(--ink)]">
          {t("checkout.pickupText")}
        </p>
      )}
    </Section>
  );
}

function LastWarehouseCard({ warehouse, fromLast, onChange }: { warehouse: NpWarehouse; fromLast: boolean; onChange: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
        <MapPin className="h-5 w-5 text-[var(--accent-hi)]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--ink)]">
          {npLabel(warehouse, t)}
          {fromLast && (
            <span className="ml-2 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 align-middle font-display text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
              {t("checkout.lastWarehouse")}
            </span>
          )}
        </p>
        <p className="text-[13px] font-medium text-[var(--muted)]">
          {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
          {warehouse.description}
        </p>
      </div>
      <Button
        type="button"
        variant="surface"
        size="sm"
        onClick={onChange}
      >
        {t("checkout.changeWarehouse")}
      </Button>
    </div>
  );
}

function DeliveryTab({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-[88px] flex-col items-start gap-1.5 rounded-[var(--r-card)] border p-4 text-left transition-[transform,border-color,background-color] active:scale-[.99] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
      }`}
    >
      {icon}
      <span className="font-display text-[14px] font-bold uppercase leading-tight tracking-[.06em]">{title}</span>
      <span className="text-[12px] font-medium" style={{ color: active ? "var(--ink)" : "var(--muted)" }}>
        {subtitle}
      </span>
    </button>
  );
}
