"use client";

/**
 * Nova Poshta city + branch inputs above the map.
 *
 * City: autocomplete over /api/np/cities. Picking one tells the parent, which frames the map on the
 * city and opens the second field. Typing over a picked city drops it (and so the branch).
 *
 * Branch: autocomplete over the picked city's branches (/api/np/warehouses — one request per city,
 * cached and shared with the map framing), searched locally by number and address. Picking one
 * selects it; a branch picked on the map shows up here too.
 */
import { Box, MapPin, Route, Store } from "lucide-react";
import type { NpCity, NpWarehouse } from "@shop/core/types";
import { useT } from "@/i18n/context";
import { api } from "@/lib/api";

const np = api.checkout;
import { useCitySearch, useWarehouseSearch } from "@shop/customer/delivery/np-search";
import type { NpStreet } from "@shop/customer/delivery/contract";
import type { DeliveryTab } from "@shop/customer/delivery/tabs";
import { useNpStreets } from "@shop/customer/delivery/use-np-delivery";
import { NpCombobox } from "./NpCombobox";

export function CitySearch({
  city,
  onCity,
}: {
  city: NpCity | null;
  onCity: (city: NpCity | null) => void;
}) {
  const t = useT();
  const { q, setQ, items, searching, isFetching } = useCitySearch(np, city);

  return (
    <NpCombobox<NpCity>
      label={t("checkout.city")}
      placeholder={t("checkout.cityPlaceholder")}
      icon={<MapPin className="h-4 w-4" strokeWidth={2.25} />}
      value={q}
      onText={(v) => {
        setQ(v);
        if (city) onCity(null);
      }}
      items={items}
      itemKey={(c) => c.ref}
      listOpen={searching}
      loading={isFetching}
      emptyText={t("checkout.cityNone")}
      onPick={(c) => {
        setQ(c.name);
        onCity(c);
      }}
      renderItem={(c) => (
        <>
          <span className="text-[14px] font-medium text-[var(--ink)]">{c.name}</span>
          {c.area && <span className="text-[12px] font-medium text-[var(--muted)]">{c.area}</span>}
        </>
      )}
    />
  );
}

export function WarehouseSearch({
  city,
  warehouse,
  onWarehouse,
  label,
  tab,
}: {
  city: NpCity;
  warehouse: NpWarehouse | null;
  onWarehouse: (w: NpWarehouse | null) => void;
  label: (w: NpWarehouse) => string;
  /** «Відділення» или «Поштомат»: список только точек этого типа. */
  tab: "WAREHOUSE" | "POSTOMAT";
}) {
  const t = useT();
  const { q, setQ, items, isFetching } = useWarehouseSearch(np, city, warehouse, false, tab satisfies DeliveryTab);

  return (
    <NpCombobox<NpWarehouse>
      label={t(tab === "POSTOMAT" ? "delivery.postomat.field" : "delivery.warehouse.field")}
      placeholder={t("checkout.warehousePlaceholder")}
      icon={<Store className="h-4 w-4" strokeWidth={2.25} />}
      value={q}
      onText={(v) => {
        setQ(v);
        if (warehouse) onWarehouse(null);
      }}
      items={items}
      itemKey={(w) => w.ref}
      listOpen
      loading={isFetching}
      emptyText={isFetching ? t("common.loading") : t(tab === "POSTOMAT" ? "delivery.postomat.none" : "checkout.warehouseNone")}
      onPick={(w) => {
        setQ(w.description);
        onWarehouse(w);
      }}
      renderItem={(w) => (
        <span className="flex w-full items-start gap-2">
          {w.category === "POSTOMAT" ? (
            <Box className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" strokeWidth={2.25} />
          ) : (
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" strokeWidth={2.25} />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-medium text-[var(--ink)]">{label(w)}</span>
            <span className="text-[12px] font-medium text-[var(--muted)]">{w.description}</span>
          </span>
        </span>
      )}
    />
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
