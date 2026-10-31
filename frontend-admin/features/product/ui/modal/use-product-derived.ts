"use client";

import { guessProductBrand } from "@shop/core/product-brand";
import { useMemo } from "react";
import {
  attributesForCategory,
  CATALOG_STALE_MS,
  isLeaf,
  isSpecEmpty,
  missingRequiredKeys,
  pathLabel,
  slugify,
  useBrandsQuery,
  useCatalogSchemaQuery,
  useCategoriesQuery,
} from "@/features/catalog";
import {
  compareAtMinorOf,
  countStaleTranslations,
  effectiveStockOf,
  hasVariants as hasVariantsOf,
  isCompareAtInvalid,
  priceMinorOf,
  type ProductForm,
} from "../../model/form";
import type { AdminProduct } from "../../model/types";
import { useTranslatedTexts } from "../../queries";
import { marginHint, useProductCost } from "./ProductCostBlock";

type Brands = ReturnType<typeof useBrandsQuery>["data"];

/** Строка «Бренд: …» или известное название в текстах — предлагается одним нажатием. */
function useBrandSuggestion(
  creating: boolean,
  f: ProductForm,
  brandList: Brands,
) {
  const brands = brandList ?? [];
  const suggested = useMemo(
    () =>
      creating
        ? null
        : guessProductBrand({ title: f.title, description: f.description }),
    [creating, f.title, f.description],
  );
  if (
    !suggested ||
    suggested.toLowerCase() === f.brand.name.trim().toLowerCase()
  )
    return null;
  const lower = suggested.toLowerCase();
  return (
    brands.find(
      (b) =>
        b.name.toLowerCase() === lower ||
        b.aliases.some((a) => a.toLowerCase() === lower),
    ) ?? { id: null as string | null, name: suggested }
  );
}

/** Всё, что окно товара выводит из формы и справочников каталога (схема категории, пропущенные поля, цены, подсказки). */
export function useProductDerived(
  open: boolean,
  product: AdminProduct | null,
  f: ProductForm,
) {
  const catsQ = useCategoriesQuery({
    enabled: open,
    staleTime: CATALOG_STALE_MS,
  });
  const brandsQ = useBrandsQuery({
    enabled: open,
    staleTime: CATALOG_STALE_MS,
  });
  const schemaQ = useCatalogSchemaQuery({ enabled: open });
  const costInfo = useProductCost(product?.id, open);
  const categories = useMemo(
    () => catsQ.data ?? schemaQ.data?.categories ?? [],
    [catsQ.data, schemaQ.data],
  );
  const brands = brandsQ.data ?? [];
  const attrs = useMemo(
    () =>
      schemaQ.data && f.categoryId
        ? attributesForCategory(
            schemaQ.data.attributes,
            categories,
            f.categoryId,
          )
        : [],
    [schemaQ.data, categories, f.categoryId],
  );
  const attrKeys = useMemo(() => new Set(attrs.map((a) => a.key)), [attrs]);
  // Значения, чьего ключа нет в схеме выбранной категории, при сохранении отбрасываются.
  const droppedKeys = useMemo(
    () =>
      schemaQ.data && f.categoryId
        ? Object.keys(f.specs).filter((k) => !attrKeys.has(k))
        : [],
    [schemaQ.data, f.categoryId, f.specs, attrKeys],
  );
  const missing = useMemo(
    () => missingRequiredKeys(attrs, f.specs),
    [attrs, f.specs],
  );
  const filledCount = attrs.filter((a) => !isSpecEmpty(f.specs[a.key])).length;
  const categoryIsLeaf =
    !f.categoryId ||
    categories.length === 0 ||
    isLeaf(categories, f.categoryId);

  // Переводы, которые сбросит правка исходника (uk/en изменённых полей на сайте станут STALE).
  const { data: translated } = useTranslatedTexts(open && !!product);
  const staleAfterSave = useMemo(
    () =>
      !product || !translated
        ? 0
        : countStaleTranslations(f, product, translated),
    [product, translated, f],
  );

  const hasVariants = hasVariantsOf(f);
  const effectiveStock = effectiveStockOf(f);
  const priceMinor = priceMinorOf(f);
  const compareAtMinor = compareAtMinorOf(f);
  // Подсказка о марже под полем цены: только когда цена отличается от сохранённой.
  const priceMarginHint =
    product && priceMinor !== product.priceMinor
      ? marginHint(costInfo, priceMinor)
      : null;
  const compareAtInvalid = isCompareAtInvalid(f);
  const slugPreview = f.slug.trim() ? slugify(f.slug) : slugify(f.title);
  const slugChanged =
    !!product?.slug && slugPreview !== "" && slugPreview !== product.slug;
  const brandSuggestion = useBrandSuggestion(!product, f, brands);
  const pathText = f.categoryId ? pathLabel(categories, f.categoryId) : "";

  return {
    catsQ,
    schemaQ,
    categories,
    brands,
    attrs,
    attrKeys,
    droppedKeys,
    missing,
    filledCount,
    categoryIsLeaf,
    staleAfterSave,
    hasVariants,
    effectiveStock,
    priceMinor,
    compareAtMinor,
    priceMarginHint,
    compareAtInvalid,
    slugPreview,
    slugChanged,
    brandSuggestion,
    pathText,
  };
}

export type ProductDerived = ReturnType<typeof useProductDerived>;
