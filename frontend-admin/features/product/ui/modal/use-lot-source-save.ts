"use client";

import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { lotSourceProblem, lotSourceRequest, procurementKeys, raiseLabel, useAssignLotSource, useFinanceAccess, type LotRaise } from "@/features/procurement";
import { stockRaiseRows } from "../../model/form";
import { S } from "../../model/steps";
import type { AdminProduct } from "../../model/types";
import type { ProductFormState } from "./use-product-form";

/** id варианта строки: известный — как есть, новый — по названию из ответа сохранения. */
function variantIdOf(r: LotRaise, saved: AdminProduct): string | null | undefined {
  if (r.variantId || r.name == null) return r.variantId;
  return saved.variants?.find((v) => v.name.trim() === r.name)?.id ?? undefined;
}

/**
 * «Откуда +N шт?» при сохранении товара. Сохранение товара как было (добавленные штуки ложатся новой партией в
 * конец очереди — у товара или у каждого варианта), а следом ответы привязывают их к поставке или дают им закупку:
 * один запрос на строку, по очереди. Не ответили — «новое поступление» без закупки, отправлять нечего. Ответ с
 * ошибкой (старый остаток без закупки) — не сохраняем; запрос упал — товар уже сохранён, штуки видны «без закупки»
 * и чинятся в таблице партий. Без права «Финансы» ничего не спрашивается.
 */
export function useLotSourceSave(form: ProductFormState) {
  const qc = useQueryClient();
  const finance = useFinanceAccess();
  const assign = useAssignLotSource();
  const { f, baseStockRef, lotSources, go } = form;

  /** Строки, где добавили штуки (снимок до сохранения: после него база остатков другая). */
  const rows = (): LotRaise[] => (finance ? stockRaiseRows(f, baseStockRef.current) : []);

  /** Перед сохранением: true — можно сохранять. */
  function ready(): boolean {
    for (const r of rows()) {
      const a = lotSources[r.key];
      const problem = a ? lotSourceProblem(a) : null;
      if (problem) {
        toast.error(`Откуда ${raiseLabel(r)}: ${problem.toLowerCase()} — на шаге «Цена и склад»`);
        go(S.pricing);
        return false;
      }
    }
    return true;
  }

  /** После успешного сохранения товара `saved`. Ошибки — тостом: сохранение товара они не отменяют. */
  async function apply(saved: AdminProduct, raised: LotRaise[]) {
    const failed: string[] = [];
    for (const r of raised) {
      const a = lotSources[r.key];
      const variantId = variantIdOf(r, saved);
      const body = a && variantId !== undefined ? lotSourceRequest(a, r.units, variantId) : null;
      if (a && variantId === undefined) failed.push(`${raiseLabel(r)} (вариант не найден)`);
      if (!body) continue;
      try {
        await assign.mutateAsync({ productId: saved.id, body });
      } catch (e) {
        failed.push(`${raiseLabel(r)} (${errorMessage(e, undefined, "ошибка")})`);
      }
    }
    void qc.invalidateQueries({ queryKey: procurementKeys.product(saved.id) });
    if (failed.length) {
      toast.error(`Товар сохранён, но не привязаны: ${failed.join("; ")}. Они видны «без закупки» в «Склад по партиям».`);
    }
  }

  return { rows, ready, apply };
}
