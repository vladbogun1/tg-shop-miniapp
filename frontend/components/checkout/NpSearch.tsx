"use client";

/**
 * Nova Poshta picking BY TEXT in the checkout — the default way in the Mini App (the map is the
 * other one). Same logic as the website's site/components/checkout/CitySearch.tsx:
 *
 * City: autocomplete over /api/np/cities. Picking one tells the parent (which drops a branch from
 * another city and opens the second field). Typing over a picked city drops it.
 *
 * Branch: autocomplete over the picked city's branches (/api/np/warehouses — one request per city,
 * cached, shared with the map framing), searched locally by number and address
 * (`searchWarehouses` from @shop/shared) and filtered by type (Усі / Відділення / Поштомати).
 * A branch picked on the map shows up here too.
 */
import { useQuery } from "@tanstack/react-query";
import { Box, MapPin, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  filterWarehouses,
  searchWarehouses,
  type NpCategoryFilter,
  type NpCity,
  type NpWarehouse,
} from "@shop/shared";
import { useT } from "@/i18n/context";
import { customerApi } from "@/lib/api";
import { NpCombobox } from "./NpCombobox";

/** One cache entry per city: the branch field and the map framing read the same list. */
export const npWarehousesQuery = (cityRef: string) => ({
  queryKey: ["np-warehouses", cityRef] as const,
  staleTime: 10 * 60_000,
  queryFn: () => customerApi.getNpWarehouses(cityRef, ""),
});

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Text that follows `external` whenever it changes to something (a pick here, on the map, or from
 * the last order), and is free to edit in between. Going back to "" is the customer typing over a
 * pick — that must not wipe what they typed. (A city change remounts the branch field instead.)
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
    queryFn: () => customerApi.getNpCities(term),
  });
  const items = searching ? data.slice(0, 8) : [];

  return (
    <NpCombobox<NpCity>
      label={t("checkout.np.city")}
      placeholder={t("checkout.np.cityPlaceholder")}
      icon={<MapPin className="h-[18px] w-[18px]" strokeWidth={2.25} />}
      value={q}
      picked={!!city}
      onText={(v) => {
        setQ(v);
        if (city) onCity(null);
      }}
      items={items}
      itemKey={(c) => c.ref}
      listOpen={searching}
      loading={isFetching}
      emptyText={t("checkout.np.cityNone")}
      clearLabel={t("common.close")}
      onPick={(c) => {
        setQ(c.name);
        onCity(c);
      }}
      renderItem={(c) => (
        <>
          <span className="text-[14px] font-semibold text-[var(--ink)]">{c.name}</span>
          {c.area && <span className="text-[12px] font-medium text-[var(--muted)]">{c.area}</span>}
        </>
      )}
    />
  );
}

const CATS: { key: NpCategoryFilter; labelKey: string }[] = [
  { key: "all", labelKey: "np.cat.all" },
  { key: "branch", labelKey: "np.cat.branch" },
  { key: "postomat", labelKey: "np.cat.postomat" },
];

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
  const [cat, setCat] = useState<NpCategoryFilter>("all");
  const { data = [], isFetching } = useQuery(npWarehousesQuery(city.ref));
  // The type chips only make sense when the city has both kinds.
  const hasBoth = useMemo(
    () => data.some((w) => w.category === "POSTOMAT") && data.some((w) => w.category !== "POSTOMAT"),
    [data]
  );
  // While a picked branch is shown in the field, the list offers the whole city again.
  const typed = warehouse && q === warehouse.description ? "" : q;
  // No separate "Пункти" chip here: NP files many ordinary branches ("Відділення №12") as POINT,
  // so "Відділення" means everything that is not a postomat.
  const filtered =
    !hasBoth || cat === "all"
      ? data
      : cat === "postomat"
        ? filterWarehouses(data, "postomat")
        : data.filter((w) => w.category !== "POSTOMAT");
  const items = searchWarehouses(filtered, typed);

  return (
    <NpCombobox<NpWarehouse>
      label={t("checkout.np.warehouse")}
      placeholder={t("checkout.np.warehousePlaceholder")}
      icon={<Store className="h-[18px] w-[18px]" strokeWidth={2.25} />}
      value={q}
      picked={!!warehouse}
      onText={(v) => {
        setQ(v);
        if (warehouse) onWarehouse(null);
      }}
      items={items}
      itemKey={(w) => w.ref}
      listOpen
      loading={isFetching}
      emptyText={isFetching ? t("common.loading") : t("checkout.np.warehouseNone")}
      clearLabel={t("common.close")}
      header={
        hasBoth ? (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-[var(--line)] px-2.5 py-2">
            {CATS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(c.key)}
                className={`nb-chip min-h-0 shrink-0 px-3 py-1 text-[11px] uppercase tracking-[0.06em] ${
                  cat === c.key ? "nb-chip-active" : "text-[var(--muted)]"
                }`}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        ) : null
      }
      onPick={(w) => {
        setQ(w.description);
        onWarehouse(w);
      }}
      renderItem={(w) => (
        <span className="flex w-full items-start gap-2.5">
          {w.category === "POSTOMAT" ? (
            <Box className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
          ) : (
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold text-[var(--ink)]">{label(w)}</span>
            <span className="break-words text-[12px] font-medium text-[var(--muted)]">{w.description}</span>
          </span>
        </span>
      )}
    />
  );
}
