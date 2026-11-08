"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@shop/ui/mutation";
import { aiKeys } from "@/features/ai";
import { catalogKeys } from "@/features/catalog";
import { procurementKeys } from "@/features/procurement";
import { draftsApi, type DraftSave, type SupplyDraft } from "./api-drafts";

/** Черновики живут под корнем «Поставок»: принятый черновик сбрасывает и список поставок, и сам себя. */
export const draftKeys = {
  list: () => [...procurementKeys.preordersRoot(), "drafts"] as const,
  one: (id: number) => [...procurementKeys.preordersRoot(), "drafts", id] as const,
};

/** Пока ИИ работает, экран сам подтягивает ход работы; готовый черновик больше не опрашивается. */
const RUNNING_POLL_MS = 2500;
const LIST_POLL_MS = 5000;

export function useDrafts() {
  return useQuery({
    queryKey: draftKeys.list(),
    queryFn: draftsApi.list,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "RUNNING") ? LIST_POLL_MS : false),
  });
}

export function useDraft(id: number) {
  return useQuery({
    queryKey: draftKeys.one(id),
    queryFn: () => draftsApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "RUNNING" ? RUNNING_POLL_MS : false),
  });
}

const AI_KEYS = [aiKeys.active(), aiKeys.summary(), aiKeys.tasksAll(), aiKeys.widget()];

export function useCreateDraft() {
  return useApiMutation<SupplyDraft, number[]>({
    mutationFn: (fileIds) => draftsApi.create(fileIds),
    invalidate: [draftKeys.list(), ...AI_KEYS],
    errorFallback: "Не удалось начать разбор накладной",
  });
}

/** Автосохранение правок: ошибку показывает экран (на 409 он перечитывает черновик). */
export function useSaveDraft(id: number) {
  return useApiMutation<SupplyDraft, DraftSave>({
    mutationFn: (body) => draftsApi.save(id, body),
    toastOnError: false,
  });
}

export function useRetryDraft(id: number) {
  return useApiMutation<SupplyDraft, void>({
    mutationFn: () => draftsApi.retry(id),
    invalidate: [draftKeys.one(id), draftKeys.list(), ...AI_KEYS],
    errorFallback: "Не удалось запустить ИИ ещё раз",
  });
}

export function useStopDraft(id: number) {
  return useApiMutation<SupplyDraft, void>({
    mutationFn: () => draftsApi.stop(id),
    invalidate: [draftKeys.one(id), draftKeys.list(), ...AI_KEYS],
    success: "ИИ остановлен",
    errorFallback: "Не удалось остановить ИИ",
  });
}

export function useDeleteDraft(id: number) {
  return useApiMutation<void, void>({
    mutationFn: () => draftsApi.remove(id),
    invalidate: [draftKeys.list(), ...AI_KEYS],
    success: "Черновик удалён",
    errorFallback: "Не удалось удалить черновик",
  });
}

/** «Принять»: создаются поставщик, товары и поставка — сбрасывается всё под «Поставками» и каталог. */
export function useAcceptDraft(id: number) {
  return useApiMutation<{ batchId: number; newProducts: number }, number>({
    mutationFn: (version) => draftsApi.accept(id, version),
    invalidate: [procurementKeys.preordersRoot(), catalogKeys.productsRoot(), catalogKeys.cardsRoot()],
    success: (r) => (r.newProducts ? `Поставка создана, новых товаров: ${r.newProducts}` : "Поставка создана"),
    errorFallback: "Не удалось создать поставку",
  });
}
