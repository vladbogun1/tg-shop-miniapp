"use client";

/**
 * Данные экрана сравнения — общие для листа Mini App и модалки сайта: каталог + схема → группы → активная группа →
 * строки таблицы, переключатель «только различия» (запоминается в localStorage). Вёрстку и загрузку каталога даёт
 * приложение (Mini App берёт запрос `["products"]`, сайт — лёгкие карточки на языке экрана).
 */
import { useEffect, useMemo, useState } from "react";
import { compareGroups, compareSections, onlyDifferences, type CompareBasics, type CompareGroup, type CompareSection, type ComparableProduct } from "@shop/core/compare";
import type { CatalogSchema } from "@shop/core/catalog";
import { localStore } from "@shop/core/storage";
import { EMPTY_SCHEMA } from "../catalog/model/filter";
import type { CompareStore } from "./store";

const ONLY_DIFF_KEY = "compare.onlyDiff";

export type CompareT = (key: string, params?: Record<string, string | number>) => string;

/** Поля карточки, которые читают базовые строки; витринный Product и StorefrontProduct их имеют. */
export type CompareViewProduct = ComparableProduct & {
  condition?: string | null;
  brandRef?: { name: string } | null;
};

export interface CompareViewOptions<P extends CompareViewProduct> {
  store: CompareStore;
  /** Каталог (undefined — ещё грузится). */
  products: P[] | undefined;
  /** Схема каталога (undefined — ещё грузится). */
  schema: CatalogSchema | undefined;
  locale: string;
  t: CompareT;
  /** Цена в строке «Цена». Должна быть стабильной между рендерами. */
  money: (p: P) => string;
  /** Есть ли товар в наличии. Стабильная функция. */
  inStock: (p: P) => boolean;
  /** Перед переключением «только различия» (Mini App — тактильный отклик). */
  onToggleDiff?: () => void;
}

export interface CompareView<P> {
  ready: boolean;
  groups: CompareGroup<P>[];
  group: CompareGroup<P> | null;
  setActive: (key: string) => void;
  onlyDiff: boolean;
  toggleDiff: () => void;
  sections: CompareSection[];
}

export function useCompareView<P extends CompareViewProduct>(o: CompareViewOptions<P>): CompareView<P> {
  const { store, products, t, locale, money, inStock } = o;
  const entries = store((s) => s.entries);
  const prune = store((s) => s.prune);
  const focusGroup = store((s) => s.focusGroup);
  const schema = o.schema ?? EMPTY_SCHEMA;

  // stored ids that are not in the catalog any more are dropped (once the list is known)
  useEffect(() => {
    if (products) prune(new Set(products.map((p) => p.id)));
  }, [products, prune]);

  const ready = !!products && !!o.schema;
  const groups = useMemo(() => (ready ? compareGroups(schema, entries, products!) : []), [ready, schema, entries, products]);
  const [active, setActive] = useState<string | null>(focusGroup);
  const group = groups.find((g) => g.key === active) ?? groups[0] ?? null;

  const [onlyDiff, setOnlyDiff] = useState(false);
  useEffect(() => {
    try {
      setOnlyDiff(localStore.getItem(ONLY_DIFF_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);
  const toggleDiff = () => {
    o.onToggleDiff?.();
    setOnlyDiff((v) => {
      try {
        localStore.setItem(ONLY_DIFF_KEY, v ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !v;
    });
  };

  const basics = useMemo<CompareBasics<P>>(() => {
    const anyUsed = group?.items.some((p) => p.condition && p.condition !== "NEW");
    const condLabel = (c: string | null | undefined) => schema.conditions.find((x) => x.value === (c ?? "NEW"))?.label ?? null;
    return {
      title: t("compare.basics"),
      rows: [
        { key: "price", label: t("compare.row.price"), value: (p) => money(p), rank: (p) => p.priceMinor },
        {
          key: "rating",
          label: t("compare.row.rating"),
          value: (p) => ((p.ratingCount ?? 0) > 0 && p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)} · ${p.ratingCount}` : null),
          rank: (p) => ((p.ratingCount ?? 0) > 0 ? (p.ratingAvg ?? null) : null),
          higherIsBetter: true,
        },
        { key: "stock", label: t("compare.row.stock"), value: (p) => (inStock(p) ? t("compare.stock.in") : t("compare.stock.out")) },
        { key: "brand", label: t("compare.row.brand"), value: (p) => p.brandRef?.name ?? null },
        ...(anyUsed ? [{ key: "cond", label: t("compare.row.condition"), value: (p: P) => condLabel(p.condition) }] : []),
      ],
    };
  }, [group, schema, t, money, inStock]);

  const sections = useMemo(() => {
    if (!group) return [];
    const all = compareSections(schema, group.items, locale, [t("catalog.yes"), t("catalog.no")], basics);
    // one product has no «differences»: the switch is hidden then and the full table shows
    return onlyDiff && group.items.length > 1 ? onlyDifferences(all) : all;
  }, [group, schema, locale, t, basics, onlyDiff]);

  return { ready, groups, group, setActive, onlyDiff, toggleDiff, sections };
}
