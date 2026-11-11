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
import type { MessageKey } from "@/i18n/ru";
import { Box, MapPin, Route, Store } from "lucide-react";
import type { NpStreet } from "@shop/customer/delivery/contract";
import { useNpStreets } from "@shop/customer/delivery/use-np-delivery";
import { useCitySearch, useWarehouseSearch, type NpTypeFilter } from "@shop/customer/delivery/np-search";
import { type NpCity, type NpWarehouse } from "@shop/core/types";
import { useCheckoutT } from "@/i18n/checkout";
import { customerApi } from "@/lib/api";

const np = customerApi.checkout;
import { NpCombobox } from "@/features/checkout/ui/NpCombobox";

export function CitySearch({
  city,
  onCity,
}: {
  city: NpCity | null;
  onCity: (city: NpCity | null) => void;
}) {
  const t = useCheckoutT();
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

const CATS: { key: NpTypeFilter; labelKey: MessageKey }[] = [
  { key: "all", labelKey: "np.cat.all" },
  { key: "branch", labelKey: "np.cat.branch" },
  { key: "postomat", labelKey: "np.cat.postomat" },
];

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
  /** «Відділення» or «Поштомат»: only points of that kind (the type chips are then not needed). */
  tab: "WAREHOUSE" | "POSTOMAT";
}) {
  const t = useCheckoutT();
  const { q, setQ, items, isFetching, hasBoth, cat, setCat } = useWarehouseSearch(np, city, warehouse, true, tab);

  return (
    <NpCombobox<NpWarehouse>
      label={t(tab === "POSTOMAT" ? "delivery.postomat.field" : "delivery.warehouse.field")}
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
      emptyText={isFetching ? t("common.loading") : t(tab === "POSTOMAT" ? "delivery.postomat.none" : "checkout.np.warehouseNone")}
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

const streetLabel = (s: NpStreet) => (s.type ? `${s.type} ${s.name}` : s.name);

/**
 * Courier street: suggestions over /api/np/streets of the picked city; not found or the search failed — the street
 * can be typed by hand (no ref, the server passes it on as is).
 */
export function StreetSearch({
  city,
  street,
  onStreet,
}: {
  city: NpCity | null;
  street: { ref: string; name: string };
  onStreet: (s: { ref: string; name: string }) => void;
}) {
  const t = useCheckoutT();
  // A picked street (has a ref) is not searched again until the text is edited.
  const found = useNpStreets(np, city?.ref, street.name, !!city && !street.ref);
  return (
    <NpCombobox<NpStreet>
      label={t("delivery.courier.street")}
      placeholder={city ? t("delivery.courier.streetPlaceholder") : t("delivery.courier.needCity")}
      icon={<Route className="h-[18px] w-[18px]" strokeWidth={2.25} />}
      value={street.name}
      picked={!!street.ref}
      onText={(v) => onStreet({ ref: "", name: v })}
      items={found.items}
      itemKey={(s) => s.ref}
      listOpen={found.searching}
      loading={found.loading}
      emptyText={found.failed ? t("delivery.courier.streetFailed") : t("delivery.courier.streetNone")}
      clearLabel={t("common.close")}
      onPick={(s) => onStreet({ ref: s.ref, name: streetLabel(s) })}
      renderItem={(s) => <span className="text-[14px] font-semibold text-[var(--ink)]">{streetLabel(s)}</span>}
    />
  );
}
