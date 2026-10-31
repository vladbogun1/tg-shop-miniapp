"use client";

import type { ProductCondition } from "@shop/core/catalog";
import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CATALOG_STALE_MS,
  productMissingRequired,
  subtreeOf,
  useBrandsQuery,
  useCatalogSchemaQuery,
  useCategoriesQuery,
} from "@/features/catalog";
import { demandOfProduct, useDemand } from "@/lib/preorders";
import {
  countByStatus,
  filterProducts,
  NO_CATEGORY,
  sortProducts,
  statusOptions,
  summarizeStock,
  type CardFilter,
  type SortKey,
  type StatusFilter,
  type ViewMode,
} from "../../model/list";
import { STEP_KEYS, type ProductStepKey } from "../../model/steps";
import type { AdminProduct } from "../../model/types";
import { invalidateProductDerived, isDoubleSubmit, useProductsQuery, useSetProductActive, useSetProductArchived } from "../../queries";
import { usePublishGate } from "../PublishGate";

export interface CompletionTarget {
  id: string;
  reason: "created" | "manual";
}

/** Ссылка «/products?edit=<id>&step=specs&brand=<id>»: что открыть и какой фильтр выставить, пока список загружен. */
function consumeDeepLink(products: AdminProduct[], open: (p: AdminProduct, step: ProductStepKey | undefined) => void, setBrand: (id: string) => void) {
  const sp = new URLSearchParams(window.location.search);
  const brand = sp.get("brand");
  if (brand) setBrand(brand);
  sp.delete("brand");
  const id = sp.get("edit");
  if (!id) {
    if (brand) {
      const qs0 = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs0 ? `?${qs0}` : ""));
    }
    return;
  }
  const p = products.find((x) => x.id === id);
  const step = sp.get("step");
  if (p) open(p, step && STEP_KEYS.has(step) ? (step as ProductStepKey) : undefined);
  sp.delete("edit");
  sp.delete("step");
  const qs = sp.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

/** Состояние и действия экрана «Товары»: фильтры, сортировка, окно товара, показ/скрытие/архив. */
export function useProductsScreen() {
  const qc = useQueryClient();
  const [archivedView, setArchivedView] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  // Шаг ссылки «/products?edit=<id>&step=specs» (из «Карточек»).
  const [editStep, setEditStep] = useState<ProductStepKey | undefined>(undefined);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("");
  const [condition, setCondition] = useState<"" | ProductCondition>("");
  const [completion, setCompletion] = useState<CompletionTarget | null>(null);
  const [sort, setSort] = useState<SortKey>("smart");
  const [view, setView] = useState<ViewMode>("list");

  const { data: products = [], isLoading } = useProductsQuery({ archived: archivedView });
  // «Чего ждут»: по нему сортировка «По спросу» и фильтр «Предзаказ» (клиентские, список целиком в памяти).
  const demandQ = useDemand();
  const waitingOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.id, demandOfProduct(demandQ.data, p.id)?.people ?? 0);
    return m;
  }, [products, demandQ.data]);
  const { data: categories = [] } = useCategoriesQuery({ staleTime: CATALOG_STALE_MS });
  const { data: brands = [] } = useBrandsQuery({ staleTime: CATALOG_STALE_MS });
  const { data: schema } = useCatalogSchemaQuery();
  const [guardPublish, gateUi] = usePublishGate((id) => setCompletion({ id, reason: "manual" }));
  const activeM = useSetProductActive();
  const archiveM = useSetProductArchived();

  /** Незаполненные обязательные характеристики по товарам (значение бэкенда, а без него — по схеме). */
  const missingOf = useMemo(() => {
    const m = new Map<string, number>();
    if (!schema) return m;
    const cats = schema.categories.length ? schema.categories : categories;
    for (const p of products) m.set(p.id, productMissingRequired(p, schema.attributes, cats).length);
    return m;
  }, [products, schema, categories]);

  const refresh = () => invalidateProductDerived(qc);

  // Ссылка «/products?edit=<id>» (с экрана «Переводы»): открыть редактор товара, как только список загружен,
  // и убрать параметр, чтобы перезагрузка не открывала его снова.
  useEffect(() => {
    if (isLoading || typeof window === "undefined") return;
    consumeDeepLink(
      products,
      (p, step) => {
        setEditStep(step);
        setEditing(p);
        setModalOpen(true);
      },
      setBrandId
    );
  }, [isLoading, products]);

  // И то и другое — в одном промахе пальцем от ошибки на телефоне, поэтому каждое подтверждается тостом «Отменить».
  async function setActive(p: AdminProduct, active: boolean, undo = true) {
    try {
      // Включение черновика сперва спрашивает (CARD_NOT_READY) — или объясняет, чего не хватает.
      const ok = active
        ? await guardPublish(p, (force) => activeM.mutateAsync({ id: p.id, active: true, force }))
        : (await activeM.mutateAsync({ id: p.id, active: false }), true);
      if (!ok) return;
      refresh();
      if (undo) {
        toast.success(active ? `«${p.title}» снова на витрине` : `«${p.title}» скрыт с витрины`, {
          action: { label: "Отменить", onClick: () => setActive(p, !active, false) },
        });
      }
    } catch (e) {
      if (!isDoubleSubmit(e)) toast.error(errorMessage(e, undefined, "Ошибка"));
    }
  }

  async function setArchived(p: AdminProduct, archived: boolean, undo = true) {
    try {
      await archiveM.mutateAsync({ id: p.id, archived });
      toast.success(archived ? `«${p.title}» в архиве` : `«${p.title}» восстановлен`, {
        action: undo ? { label: "Отменить", onClick: () => setArchived(p, !archived, false) } : undefined,
      });
      refresh();
    } catch (e) {
      if (!isDoubleSubmit(e)) toast.error(errorMessage(e, undefined, "Ошибка"));
    }
  }

  const visible = useMemo(() => {
    const categoryScope: Set<string> | "none" | null =
      categoryId === NO_CATEGORY ? "none" : categoryId ? subtreeOf(categories, categoryId) : null;
    const filtered = filterProducts(products, { search, status, categoryScope, brandId, condition, cardFilter, archivedView, missingOf, waitingOf });
    return sortProducts(filtered, sort, waitingOf);
  }, [products, search, status, categoryId, categories, brandId, condition, cardFilter, missingOf, sort, archivedView, waitingOf]);

  const counts = useMemo(() => countByStatus(products, waitingOf), [products, waitingOf]);
  // Склад по активным (не архивным) товарам: штуки и розничная стоимость.
  const stockSummary = useMemo(() => summarizeStock(products), [products]);
  const statusChips = useMemo(() => statusOptions(counts, status), [counts, status]);

  const activeFilters = [categoryId, brandId, cardFilter, condition].filter(Boolean).length;
  function resetFilters() {
    setCategoryId("");
    setBrandId("");
    setCardFilter("");
    setCondition("");
  }

  function openEditor(p: AdminProduct | null) {
    setEditing(p);
    setModalOpen(true);
  }
  function closeEditor() {
    setModalOpen(false);
    setEditStep(undefined);
  }

  return {
    archivedView, setArchivedView,
    modalOpen, editing, editStep, openEditor, closeEditor,
    search, setSearch, status, setStatus, categoryId, setCategoryId, brandId, setBrandId,
    cardFilter, setCardFilter, condition, setCondition, sort, setSort, view, setView,
    completion, setCompletion,
    products, isLoading, visible, missingOf, categories, brands,
    statusChips, stockSummary, activeFilters, resetFilters,
    setActive, setArchived, refresh, gateUi,
  };
}
