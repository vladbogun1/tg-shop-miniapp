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
import { Box, MapPin, Store } from "lucide-react";
import { useCitySearch, useWarehouseSearch, type NpTypeFilter } from "@shop/customer/delivery/np-search";
import { type NpCity, type NpWarehouse } from "@shop/core/types";
import { useT } from "@/i18n/context";
import { customerApi } from "@/lib/api";

const np = customerApi.checkout;
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

const CATS: { key: NpTypeFilter; labelKey: string }[] = [
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
  const { q, setQ, items, isFetching, hasBoth, cat, setCat } = useWarehouseSearch(np, city, warehouse, true);

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
