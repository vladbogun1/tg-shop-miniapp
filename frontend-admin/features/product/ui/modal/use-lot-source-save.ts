"use client";

import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { lotSourceProblem, lotSourceRequest, procurementKeys, useAssignLotSource, useFinanceAccess } from "@/features/procurement";
import { plainStockRaise } from "../../model/form";
import { S } from "../../model/steps";
import type { ProductFormState } from "./use-product-form";

/**
 * «Откуда +N шт?» при сохранении товара. Сохранение товара как было (добавленные штуки ложатся новой партией в
 * конец очереди), а следом ответ привязывает их к поставке или даёт им закупку. Не ответили — это «новое
 * поступление» без закупки, отправлять нечего. Ответ с ошибкой (старый остаток без закупки) — не сохраняем;
 * второй вызов упал — товар уже сохранён, штуки видны «без закупки» и чинятся в таблице партий.
 * Без права «Финансы» ничего не спрашивается.
 */
export function useLotSourceSave(form: ProductFormState) {
  const qc = useQueryClient();
  const finance = useFinanceAccess();
  const assign = useAssignLotSource();
  const { f, baseStockRef, lotSource, go } = form;

  /** Перед сохранением: true — можно сохранять. */
  function ready(): boolean {
    const raise = plainStockRaise(f, baseStockRef.current);
    const problem = finance && raise > 0 && lotSource ? lotSourceProblem(lotSource) : null;
    if (!problem) return true;
    toast.error(`Откуда +${raise} шт: ${problem.toLowerCase()} — на шаге «Цена и склад»`);
    go(S.pricing);
    return false;
  }

  /** После успешного сохранения товара `productId`. Ошибку показывает тостом: сохранение товара она не отменяет. */
  async function apply(productId: string, raise: number) {
    const body = finance && lotSource && raise > 0 ? lotSourceRequest(lotSource, raise, null) : null;
    if (!body) {
      void qc.invalidateQueries({ queryKey: procurementKeys.product(productId) });
      return;
    }
    try {
      await assign.mutateAsync({ productId, body });
    } catch (e) {
      toast.error(`Товар сохранён, но +${raise} шт не привязаны: ${errorMessage(e, undefined, "ошибка")}. Они видны «без закупки» в «Склад по партиям».`);
      void qc.invalidateQueries({ queryKey: procurementKeys.product(productId) });
    }
  }

  return { ready, apply };
}
