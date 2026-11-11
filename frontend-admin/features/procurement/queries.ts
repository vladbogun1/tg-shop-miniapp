"use client";

import { errorMessage } from "@shop/core/errors";
import { QUERY_PRESETS } from "@shop/core/query";
import { toast } from "@shop/ui/toast";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogKeys } from "@/features/catalog";
import { isAuthenticated } from "@/lib/session";
import { costingApi, preordersApi } from "./api";
import { procurementKeys } from "./keys";
import { releaseSummary, sumReleases } from "./model/demand";
import type { Batch, BatchRequest, Demand, LotCostRequest, LotSourceRequest, ProductCost, Supplier } from "./model/types";

const DEMAND_STALE_MS = 60_000;

/** «Чего ждут» — один запрос на экран «Поставки», список товаров и карточку товара. */
export function useDemand(enabled = true) {
  return useQuery({
    queryKey: procurementKeys.demand(),
    queryFn: preordersApi.demand,
    enabled: enabled && isAuthenticated(),
    staleTime: DEMAND_STALE_MS,
    retry: false,
  });
}

/** Себестоимость товара; undefined — нет права «Финансы», не загружено или не нужно (новый товар). */
export function useProductCost(productId: string | null | undefined, enabled = true): ProductCost | undefined {
  const finance = useFinanceAccess();
  const q = useQuery({
    queryKey: procurementKeys.product(productId as string),
    queryFn: () => costingApi.product(productId as string),
    enabled: finance && enabled && !!productId,
    staleTime: QUERY_PRESETS.list.staleTime,
    retry: false,
  });
  return finance ? q.data : undefined;
}

/** May the caller see money. Until the answer arrives (or on error) — no: money blocks stay hidden. */
export function useFinanceAccess(): boolean {
  const q = useQuery({
    queryKey: procurementKeys.access(),
    queryFn: costingApi.access,
    enabled: isAuthenticated(),
    staleTime: QUERY_PRESETS.static.staleTime,
    retry: false,
  });
  return q.data?.finance === true;
}

export function useSuppliers(enabled = true) {
  return useQuery({ queryKey: procurementKeys.suppliers(), queryFn: preordersApi.suppliers, enabled });
}

/** Память поставщика «Поставки с ИИ»; без поставщика — пусто. */
export function useSupplierAliases(supplierId: number | null) {
  return useQuery({
    queryKey: procurementKeys.aliases(supplierId ?? 0),
    queryFn: () => preordersApi.aliases(supplierId as number),
    enabled: supplierId != null,
    retry: false,
  });
}

/** Очередь по товару (все варианты). */
export function useProductSubscribers(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: procurementKeys.productSubs(productId),
    queryFn: () => preordersApi.productSubscribers(productId),
    enabled,
  });
}

export function useRemoveSubscriber() {
  return useApiMutation({
    mutationFn: (id: number) => preordersApi.removeSubscriber(id),
    invalidate: [procurementKeys.preordersRoot()],
    success: "Убран из очереди",
    errorFallback: "Не удалось убрать",
  });
}

export function useCreateSupplier(handlers: { onCreated?: (s: Supplier) => void; onError?: (message: string) => void }) {
  return useApiMutation({
    mutationFn: (body: { name: string; note: string | null }) => preordersApi.createSupplier(body),
    invalidate: [procurementKeys.suppliers()],
    success: "Поставщик добавлен",
    toastOnError: false,
    onSuccess: (s) => handlers.onCreated?.(s),
    onError: (e) => handlers.onError?.(errorMessage(e, undefined, "Не удалось сохранить")),
  });
}

/** Раздать брони по строкам «Чего ждут»: одна строка — один запрос, результаты суммируются. */
export function useReleaseDemand() {
  return useApiMutation({
    mutationFn: async (rows: Pick<Demand, "productId" | "variantId">[]) => {
      const results = [];
      for (const r of rows) results.push(await preordersApi.release(r.productId, r.variantId ?? null));
      return sumReleases(results);
    },
    invalidate: [procurementKeys.preordersRoot(), catalogKeys.productsRoot()],
    errorFallback: "Не удалось раздать брони",
    onSuccess: (res) => {
      (res.heldPeople > 0 ? toast.success : toast.info)(releaseSummary(res));
    },
  });
}

/** Создать или сохранить поставку. Ошибка — не тостом, а в подвале формы (`onError`). */
export function useSaveBatch(handlers: { onSaved: (b: Batch) => void; onError: (message: string) => void }) {
  return useApiMutation({
    mutationFn: ({ id, body }: { id: number | null; body: BatchRequest }) =>
      id != null ? preordersApi.update(id, body) : preordersApi.create(body),
    invalidate: [procurementKeys.preordersRoot()],
    success: (_b, v) => (v.id != null ? "Поставка сохранена" : "Поставка создана"),
    toastOnError: false,
    onSuccess: (b) => handlers.onSaved(b),
    onError: (e) => handlers.onError(errorMessage(e, undefined, "Не удалось сохранить")),
  });
}

/** Свежая себестоимость товара из ответа — сразу в кэш карточки; остальное под «costing» (маржа, «Начальная») — перечитать. */
function useCostWriter() {
  const qc = useQueryClient();
  return (cost: ProductCost) => {
    qc.setQueryData(procurementKeys.product(cost.productId), cost);
    void qc.invalidateQueries({ queryKey: procurementKeys.costingRoot(), predicate: (q) => q.queryKey[1] !== "product" });
  };
}

/** Вписать закупку и доставку старому / ручному остатку (null — очистить). */
export function useSetLotCost() {
  const write = useCostWriter();
  return useApiMutation({
    mutationFn: ({ lotId, body }: { lotId: number; body: LotCostRequest }) => costingApi.setLotCost(lotId, body),
    success: (_c, v) => (v.body.purchaseMinor == null ? "Закупка очищена" : "Закупка сохранена"),
    errorFallback: "Не удалось сохранить закупку",
    onSuccess: write,
  });
}

/** Штуки без закупки: из какой поставки они или почём куплены. Ошибку показывает форма (`toastOnError: false`). */
export function useAssignLotSource() {
  const write = useCostWriter();
  return useApiMutation({
    mutationFn: ({ productId, body }: { productId: string; body: LotSourceRequest }) => costingApi.assignLotSource(productId, body),
    toastOnError: false,
    onSuccess: write,
  });
}
