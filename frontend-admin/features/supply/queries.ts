"use client";

import { errorMessage } from "@shop/core/errors";
import { toMinor } from "@shop/core/money";
import { toast } from "@shop/ui/toast";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogKeys } from "@/features/catalog";
import {
  costingApi,
  preordersApi,
  procurementKeys,
  type ArriveBody,
  type ArriveResult,
  type BatchFilter,
  type BatchMoney,
  type Expense,
  type ExpenseRequest,
  type MoneyRequest,
  type OpeningBody,
} from "@/features/procurement";
import { productApi } from "@/features/product";
import { aliasesOf, mergeLines, resolvedLines, type Created, type NewProductPlan } from "./model/ai/plan";
import type { ReviewRow } from "./model/ai/types";

export function useBatchesList(filter: BatchFilter) {
  return useQuery({
    queryKey: procurementKeys.batches(filter),
    queryFn: () => preordersApi.batches(filter),
  });
}

export function useBatch(id: string) {
  return useQuery({
    queryKey: procurementKeys.batch(id),
    queryFn: () => preordersApi.batch(id),
    enabled: !!id,
  });
}

export function useBatchSubscribers(batchId: number) {
  return useQuery({
    queryKey: procurementKeys.batchSubs(batchId),
    queryFn: () => preordersApi.subscribers(batchId),
  });
}

export function useSuppliersList() {
  return useQuery({
    queryKey: procurementKeys.suppliers(),
    queryFn: preordersApi.suppliers,
  });
}

/** Себестоимость штуки из поставки для окна прихода: только с правом «Финансы», без права молча нет. */
export function useBatchCosting(batchId: number, enabled: boolean) {
  return useQuery({
    queryKey: procurementKeys.batchCosting(batchId),
    queryFn: () => costingApi.money(batchId),
    enabled,
    retry: false,
  });
}

export function useBatchMoney(batchId: number) {
  return useQuery({
    queryKey: procurementKeys.money(batchId),
    queryFn: () => costingApi.money(batchId),
    retry: false,
  });
}

export function useBatchSales(batchId: number) {
  return useQuery({
    queryKey: procurementKeys.sales(batchId),
    queryFn: () => costingApi.sales(batchId),
    retry: false,
  });
}

export function useOpeningRows() {
  return useQuery({
    queryKey: procurementKeys.opening(),
    queryFn: costingApi.opening,
    retry: false,
  });
}

/**
 * «Посчитать» (dryRun: предпросмотр) и «Подтвердить» (настоящий приход). Ошибка — в подвале окна, не тостом.
 * После настоящего прихода обновляются поставки и товары (остаток, цены, брони).
 */
export function useArrive(
  batchId: number,
  handlers: {
    onPreview: (r: ArriveResult) => void;
    onDone: () => void;
    onError: (m: string | null) => void;
  },
) {
  return useApiMutation({
    mutationFn: ({ dryRun, body }: { dryRun: boolean; body: Omit<ArriveBody, "dryRun"> }) => preordersApi.arrive(batchId, { dryRun, ...body }),
    invalidate: (_res, v) => (v.dryRun ? [] : [procurementKeys.preordersRoot(), catalogKeys.productsRoot()]),
    toastOnError: false,
    onSuccess: (res, v) => {
      handlers.onError(null);
      if (v.dryRun) return handlers.onPreview(res);
      toast.success(`Приход проведён. Бронь получили ${res.lines.reduce((n, l) => n + l.heldPeople, 0)} чел.`);
      handlers.onDone();
    },
    onError: (e) => handlers.onError(errorMessage(e, undefined, "Не получилось")),
  });
}

// ---- «Деньги» поставки --------------------------------------------------------------

/** Свежий ответ «денег» кладём в кэш, а продажи и поставки помечаем устаревшими. */
function useApplyMoney(batchId: number) {
  const qc = useQueryClient();
  return (r: BatchMoney) => {
    qc.setQueryData(procurementKeys.money(batchId), r);
    void qc.invalidateQueries({ queryKey: procurementKeys.sales(batchId) });
    void qc.invalidateQueries({ queryKey: procurementKeys.preordersRoot() });
  };
}

export function useSaveMoney(batchId: number) {
  const apply = useApplyMoney(batchId);
  return useApiMutation({
    mutationFn: (body: MoneyRequest) => costingApi.saveMoney(batchId, body),
    success: "Деньги поставки сохранены",
    errorFallback: "Не удалось сохранить",
    onSuccess: apply,
  });
}

export function useDeleteExpense(batchId: number) {
  const apply = useApplyMoney(batchId);
  return useApiMutation({
    mutationFn: (id: number) => costingApi.deleteExpense(id),
    success: "Расход удалён",
    errorFallback: "Не удалось удалить",
    onSuccess: apply,
  });
}

/** Прикрепить документы к расходу: файлы грузятся по одному, в кэш попадает последний ответ. */
export function useAttachExpenseFiles(batchId: number) {
  const apply = useApplyMoney(batchId);
  return useApiMutation({
    mutationFn: async ({ expenseId, files }: { expenseId: number; files: File[] }) => {
      let last: BatchMoney | null = null;
      for (const f of files) last = await costingApi.addExpenseFile(expenseId, f);
      return last;
    },
    success: (_r, v) => (v.files.length > 1 ? `Документов прикреплено: ${v.files.length}` : "Документ прикреплён"),
    errorFallback: "Не удалось загрузить документ",
    onSuccess: (r) => {
      if (r) apply(r);
    },
  });
}

export function useDeleteExpenseFile(batchId: number) {
  const apply = useApplyMoney(batchId);
  return useApiMutation({
    mutationFn: (fileId: number) => costingApi.deleteExpenseFile(fileId),
    errorFallback: "Не удалось удалить документ",
    onSuccess: apply,
  });
}

/** Добавить или изменить расход; ошибка — внутри окна. */
export function useSaveExpense(batchId: number, handlers: { onSaved: () => void; onError: (m: string) => void }) {
  const apply = useApplyMoney(batchId);
  return useApiMutation({
    mutationFn: ({ edit, body }: { edit: Expense | null; body: ExpenseRequest }) =>
      edit ? costingApi.updateExpense(edit.id, body) : costingApi.addExpense(batchId, body),
    success: (_r, v) => (v.edit ? "Расход изменён" : "Расход добавлен"),
    toastOnError: false,
    onSuccess: (r) => {
      apply(r);
      handlers.onSaved();
    },
    onError: (e) => handlers.onError(errorMessage(e, undefined, "Не удалось сохранить")),
  });
}

/** «Курс НБУ»: подставляет курс через `onRate`; `announce` — ещё и тост с датой курса. */
export function useNbuRate(onRate: (rate: string) => void, announce: boolean) {
  return useApiMutation({
    mutationFn: ({ currency, date }: { currency: string; date?: string }) => costingApi.nbuRate(currency, date),
    success: (r) => (announce && r.rate != null ? `Курс НБУ на ${r.date}: ${r.rate}` : undefined),
    errorFallback: "Не удалось получить курс",
    onSuccess: (r) => {
      if (r.rate != null) onRate(String(r.rate));
      else toast.error("НБУ не отдал курс — введите вручную");
    },
  });
}

/** Подтверждённый ввод стоимости остатка в «Стоимости остатка» (экран старых остатков). */
export function useSetOpeningCost() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (body: OpeningBody) => costingApi.setOpening(body),
    success: "Сохранено",
    errorFallback: "Не удалось сохранить",
    onSuccess: (rows, v) => {
      qc.setQueryData(procurementKeys.opening(), rows);
      void qc.invalidateQueries({
        queryKey: procurementKeys.product(v.productId),
      });
      void qc.invalidateQueries({ queryKey: procurementKeys.report() });
    },
  });
}

export function useReconcile() {
  return useApiMutation({
    mutationFn: () => costingApi.reconcile(),
    invalidate: [procurementKeys.costingRoot()],
    success: (r) => (r.fixed > 0 ? `Выровнено: ${r.fixed} из ${r.keys}` : "Партии уже совпадают со складом"),
    errorFallback: "Не удалось выровнять",
  });
}

// ---- карточка поставки --------------------------------------------------------------

export function useSetBatchStatus(batchId: number) {
  return useApiMutation({
    mutationFn: (s: "IN_TRANSIT" | "CUSTOMS") => preordersApi.setStatus(batchId, s),
    invalidate: [procurementKeys.preordersRoot()],
    success: "Статус обновлён",
    errorFallback: "Не удалось",
  });
}

export function useCancelBatch(batchId: number, onDone: () => void) {
  return useApiMutation({
    mutationFn: (closeQueue: boolean) => preordersApi.cancel(batchId, closeQueue),
    invalidate: [procurementKeys.preordersRoot()],
    success: "Поставка отменена",
    errorFallback: "Не удалось отменить",
    onSuccess: onDone,
  });
}

// ---- «Поставка с ИИ» ----------------------------------------------------------------

export interface SupplyAiApplyInput {
  supplierId: string;
  /** Нет поставщика в списке — завести с этим названием. */
  supplierName: string | null;
  plans: NewProductPlan[];
  rows: ReviewRow[];
  /** Уже созданные на прошлой попытке (по draftKey) — второй раз не создаём. */
  created: Map<string, Created>;
  onCreated: (key: string, c: Created) => void;
}

/**
 * Новые товары скрытыми черновиками (остаток 0), поставщик при необходимости и память поставщика. Поставку создаёт
 * обычная форма поставки, которую экран открывает с этими позициями. Создание по одному: упавший товар не
 * откатывает созданные — повтор их пропустит.
 */
export function useApplySupplyAi() {
  return useApiMutation({
    mutationFn: async (input: SupplyAiApplyInput) => {
      let sid = input.supplierId ? Number(input.supplierId) : null;
      if (sid == null && input.supplierName) sid = (await preordersApi.createSupplier({ name: input.supplierName, note: "Создан «Поставкой с ИИ»" })).id;
      const created = new Map(input.created);
      for (const p of input.plans) {
        if (created.has(p.key)) continue;
        const saved = await productApi.create({
          title: p.title,
          priceMinor: toMinor(p.priceUah ?? 0),
          currency: "UAH",
          stock: 0,
          active: false,
          imageKeys: [],
          categoryId: p.categoryId,
          ...(p.brand ? { brandName: p.brand } : {}),
          condition: "NEW",
          cardStatus: "DRAFT",
          variants: p.variants.map((name) => ({ name, stock: 0 })),
        });
        const c = { productId: saved.id, variants: (saved.variants ?? []).map((v) => ({ id: v.id ?? "", name: v.name })) };
        created.set(p.key, c);
        input.onCreated(p.key, c);
      }
      const resolved = resolvedLines(input.rows, created);
      if (sid != null && resolved.length > 0) await preordersApi.saveAliases(sid, aliasesOf(resolved));
      return { supplierId: sid, lines: mergeLines(resolved), created };
    },
    invalidate: [catalogKeys.productsRoot(), procurementKeys.preordersRoot()],
    errorFallback: "Не удалось подготовить поставку",
  });
}
