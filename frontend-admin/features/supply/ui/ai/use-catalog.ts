"use client";

import { useMemo } from "react";
import { useCategoriesQuery } from "@/features/catalog";
import { PICK_PRODUCTS_STALE_MS, useProductsQuery } from "@/features/product";
import type { LeafCategory } from "../../model/ai/match-prompt";
import type { CatalogItem } from "../../model/ai/types";

/**
 * Каталог глазами «Поставки с ИИ»: товары с вариантами и конечные категории (куда можно положить новый товар).
 * `enabled=false` — окно закрыто: весь каталог (≈1,8 МБ) не грузим.
 */
export function useCatalog(enabled = true) {
  const productsQ = useProductsQuery({ staleTime: PICK_PRODUCTS_STALE_MS, enabled });
  const categoriesQ = useCategoriesQuery();
  const catalog = useMemo<CatalogItem[]>(
    () =>
      (productsQ.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brandRef?.name ?? null,
        categoryId: p.categoryId ?? null,
        variants: (p.variants ?? []).filter((v) => v.id).map((v) => ({ id: v.id as string, name: v.name })),
        imageUrl: p.images?.[0]?.url ?? null,
        hidden: !p.active,
      })),
    [productsQ.data],
  );
  const categories = useMemo<LeafCategory[]>(
    () => (categoriesQ.data ?? []).filter((c) => !(categoriesQ.data ?? []).some((x) => x.parentId === c.id)).map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    [categoriesQ.data],
  );
  return { catalog, categories, loading: productsQ.isLoading || categoriesQ.isLoading };
}
