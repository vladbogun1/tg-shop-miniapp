"use client";

/**
 * State of the catalog screen: the product list, filter/search/sort, category rows, pre-order states,
 * deep link from the bot (/?product=<id>). Catalog v2: everything comes from ["products"] + the schema
 * (["catalogSchema", locale]); filtering/facets go through the shared engine (filterProducts).
 */
import { useQuery } from "@tanstack/react-query";
import { catalogKeys } from "@shop/customer/catalog/keys";
import { useEffect, useMemo, useState } from "react";
import { activeFilterCount, categoryBySlug, categoryPath, childCategories, filterForCategory, filterProducts, MARKDOWN_COLLECTION_SLUG, specSummary } from "@shop/core/catalog";
import type { CatalogSchema } from "@shop/core/catalog";
import { compareGroupOf } from "@shop/core/compare";
import { EMPTY_SCHEMA } from "@shop/customer/catalog/model/filter";
import { productInStock } from "@shop/customer/catalog/model/stock";
import { activeFilterChips, toEngineItems, useCatalogSchema, useStoredFilter } from "@/features/catalog";
import { useCompare } from "@/features/compare";
import { preorderCardState, preorderTier, useComing, useMyPreorders } from "@/features/preorders";
import { useI18n } from "@/i18n/context";
import { customerApi, type Product } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { haptic } from "@/platform/telegram";
import { useProductDeepLink } from "./use-product-deep-link";
import { sortProducts, type SortKey } from "../model/sort";

/** Level 1: roots in sortOrder (in the menu, with products) · "Уценка" last if anything is not new; children of the active root. */
function useCategoryRows(schema: CatalogSchema, category: string | null, products: Product[]) {
  const roots = useMemo(
    () => childCategories(schema, null).filter((c) => c.showInMenu && c.productCount > 0),
    [schema],
  );
  const hasMarkdown = useMemo(() => products.some((p) => p.condition && p.condition !== "NEW"), [products]);
  const activeRoot =
    category && category !== MARKDOWN_COLLECTION_SLUG ? (categoryPath(schema, categoryBySlug(schema, category)?.id)[0] ?? null) : null;
  const children = useMemo(
    () => (activeRoot ? childCategories(schema, activeRoot.id).filter((c) => c.showInMenu && c.productCount > 0) : []),
    [schema, activeRoot],
  );
  return { roots, hasMarkdown, activeRoot, children };
}

export function useHome() {
  const { t, locale, tag: localeTag } = useI18n();
  const [selected, setSelected] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useStoredFilter();
  const [sort, setSort] = useState<SortKey>("popular");
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyPre, setOnlyPre] = useState(false);
  const [notifyFor, setNotifyFor] = useState<Product | null>(null);
  const token = useAccessToken();
  const coming = useComing();
  const mine = useMyPreorders().list;
  const schemaQuery = useCatalogSchema();
  const schema = schemaQuery.data ?? EMPTY_SCHEMA;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: catalogKeys.products,
    queryFn: () => customerApi.getProducts(),
  });

  const products = useMemo(() => data ?? [], [data]);

  const items = useMemo(() => toEngineItems(products), [products]);

  // Pre-order state per product (null = an ordinary in-stock one): badge, term, button, sort tier.
  const preStates = useMemo(() => {
    const m = new Map<string, ReturnType<typeof preorderCardState>>();
    for (const p of products) m.set(p.id, preorderCardState(p, productInStock(p), coming, mine));
    return m;
  }, [products, coming, mine]);
  const hasPre = useMemo(() => products.some((p) => preStates.get(p.id)?.kind === "preorder"), [products, preStates]);

  useProductDeepLink(products, setSelected);

  // A stored category that no longer exists (renamed/emptied) is ignored, not a blank screen.
  const category =
    filter.category === MARKDOWN_COLLECTION_SLUG || categoryBySlug(schema, filter.category) ? (filter.category ?? null) : null;
  const effective = useMemo(() => ({ ...filter, category, q: search.trim() || undefined }), [filter, category, search]);

  const { roots, hasMarkdown, activeRoot, children } = useCategoryRows(schema, category, products);

  const sorted = useMemo(() => {
    let list = filterProducts(schema, items, effective).map((x) => x.src);
    if (onlyPre) list = list.filter((p) => preStates.get(p.id)?.kind === "preorder");
    // In stock (and held for me) → pre-order → out of stock.
    return sortProducts(list, sort, (p) => preorderTier(preStates.get(p.id) ?? null));
  }, [schema, items, effective, sort, onlyPre, preStates]);

  const summaries = useMemo(() => {
    const yesNo: [string, string] = [t("catalog.yes"), t("catalog.no")];
    const m = new Map<string, string>();
    if (schema.attributes.length === 0) return m;
    for (const p of products) {
      const line = specSummary(schema, p.categoryId, p.specs, locale, yesNo);
      if (line) m.set(p.id, line);
    }
    return m;
  }, [schema, products, locale, t]);

  // Opening the comparison (from the toast or the product view) closes the product on top of the
  // catalog; a product opened FROM the comparison then lies over it, and closing it comes back there.
  const compareOpen = useCompare((s) => s.open);
  useEffect(() => {
    if (compareOpen) setSelected(null);
  }, [compareOpen]);
  const compareGroups = useMemo(() => {
    const m = new Map<string, string>();
    if (schema.categories.length === 0) return m;
    for (const p of products) m.set(p.id, compareGroupOf(schema, p.categoryId));
    return m;
  }, [schema, products]);

  const filterCount = activeFilterCount(filter);
  const activeChips = useMemo(() => activeFilterChips(schema, filter, t, localeTag), [schema, filter, t, localeTag]);

  const selectCategory = (slug: string | null) => {
    haptic();
    setFilter((f) => filterForCategory(f, slug));
  };

  const ribbonProducts = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return coming.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && preStates.get(p.id)?.kind === "preorder");
  }, [products, coming, preStates]);
  const showRibbon =
    ribbonProducts.length > 0 && !onlyPre && !search.trim() && filterCount === 0 && category === null && !isLoading && !isError;

  const showControls = !isLoading && !isError && products.length > 0;

  return {
    selected, setSelected, search, setSearch, filter, setFilter, sort, setSort, sortOpen, setSortOpen,
    filtersOpen, setFiltersOpen, onlyPre, setOnlyPre, notifyFor, setNotifyFor, token, coming, mine,
    schema, items, products, isLoading, isError, refetch, isRefetching, preStates, hasPre, category,
    roots, hasMarkdown, activeRoot, children, sorted, summaries, compareGroups, filterCount, activeChips,
    selectCategory, ribbonProducts, showRibbon, showControls,
  };
}

export type HomeState = ReturnType<typeof useHome>;
