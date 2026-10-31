"use client";

/**
 * Catalog v2 glue for the Mini App: the schema query, the filter state kept in sessionStorage and
 * the adapter that feeds products into the shared engine (`@shop/shared` catalog.ts — the only
 * filter/facet implementation; nothing here re-implements matching).
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { CatalogFilter, FilterableProduct, ProductCondition } from "@shop/core/catalog";
import { EMPTY_FILTER } from "@shop/customer/catalog/model/filter";
import { productInStock } from "@shop/customer/catalog/model/stock";
import { useI18n } from "@/i18n/context";
import { customerApi, type Product } from "@/lib/api";
import { sessionStore } from "@shop/core/storage";

export function useCatalogSchema() {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ["catalogSchema", locale],
    queryFn: () => customerApi.getCatalogSchema(),
    staleTime: 5 * 60_000,
  });
}

/** What the engine sees: the product's catalog fields + its effective stock, with the original attached. */
export interface EngineItem extends FilterableProduct {
  src: Product;
}

export function toEngineItems(products: Product[]): EngineItem[] {
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    priceMinor: p.priceMinor,
    stock: productInStock(p) ? 1 : 0,
    categoryId: p.categoryId ?? null,
    brandRef: p.brandRef ?? null,
    condition: p.condition ?? "NEW",
    specs: p.specs,
    src: p,
  }));
}

export function isUsedOrMarkdown(c: ProductCondition | null | undefined): boolean {
  return !!c && c !== "NEW";
}

// ---- filter state (sessionStorage, survives opening a product / switching tabs) ------------

const STORAGE_KEY = "catalog.filter.v2";

function read(): CatalogFilter | null {
  try {
    const raw = sessionStore.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CatalogFilter;
    return v && typeof v === "object" ? { ...EMPTY_FILTER, ...v, q: undefined } : null;
  } catch {
    return null;
  }
}

/**
 * The catalog filter, restored after mount (the first render matches the server's) and written
 * back on every change. `q` is not stored here — search stays its own field.
 */
export function useStoredFilter(): [CatalogFilter, (next: CatalogFilter | ((f: CatalogFilter) => CatalogFilter)) => void] {
  const [filter, setFilterState] = useState<CatalogFilter>(EMPTY_FILTER);
  useEffect(() => {
    const saved = read();
    if (saved) setFilterState(saved);
  }, []);

  const setFilter = useCallback((next: CatalogFilter | ((f: CatalogFilter) => CatalogFilter)) => {
    setFilterState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      try {
        sessionStore.setItem(STORAGE_KEY, JSON.stringify({ ...v, q: undefined }));
      } catch {
        /* private mode — the filter just does not survive */
      }
      return v;
    });
  }, []);

  return [filter, setFilter];
}
