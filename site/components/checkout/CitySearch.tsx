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
import { useQuery } from "@tanstack/react-query";
import { Box, MapPin, Store } from "lucide-react";
import { useState } from "react";
import type { NpCity, NpWarehouse } from "@shop/shared";
import { useT } from "@/i18n/context";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { searchWarehouses } from "@shop/shared";
import { NpCombobox } from "./NpCombobox";

/** One cache entry per city: the branch field and the map framing read the same list. */
export const npWarehousesQuery = (cityRef: string) => ({
  queryKey: ["np-warehouses", cityRef] as const,
  staleTime: 10 * 60_000,
  queryFn: () => api.npWarehouses(cityRef, ""),
});

/**
 * Text that follows `external` whenever it changes to something (a pick here, on the map, or from
 * the last order), and is free to edit in between. Going back to "" is the user typing over a pick —
 * that must not wipe what they typed. (A city change remounts the branch field instead.)
 */
function useSyncedText(external: string): [string, (v: string) => void] {
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(external);
  if (seen !== external) {
    setSeen(external);
    if (external) setText(external);
  }
  return [text, setText];
}

export function CitySearch({
  city,
  onCity,
}: {
  city: NpCity | null;
  onCity: (city: NpCity | null) => void;
}) {
  const t = useT();
  const [q, setQ] = useSyncedText(city?.name ?? "");
  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= 2 && term !== city?.name;
  const { data = [], isFetching } = useQuery({
    queryKey: ["np-cities", term],
    enabled: searching,
    staleTime: 5 * 60_000,
    queryFn: () => api.npCities(term),
  });
  const items = searching ? data.slice(0, 8) : [];

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
}: {
  city: NpCity;
  warehouse: NpWarehouse | null;
  onWarehouse: (w: NpWarehouse | null) => void;
  label: (w: NpWarehouse) => string;
}) {
  const t = useT();
  const [q, setQ] = useSyncedText(warehouse?.description ?? "");
  const { data = [], isFetching } = useQuery(npWarehousesQuery(city.ref));
  // While a picked branch is shown in the field, the list offers the whole city again.
  const typed = warehouse && q === warehouse.description ? "" : q;
  const items = searchWarehouses(data, typed);

  return (
    <NpCombobox<NpWarehouse>
      label={t("checkout.warehouseField")}
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
      emptyText={isFetching ? t("common.loading") : t("checkout.warehouseNone")}
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
