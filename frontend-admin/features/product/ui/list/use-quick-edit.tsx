"use client";

/**
 * Быстрая правка цены и остатка в списке (тело запроса и проверки — model/quick-edit.ts).
 * Оптимистично: новое значение сразу в списке, при любой ошибке сервера список возвращается к снимку до правки.
 * Уходит `PATCH /products/{id}/quick` с тем, что админ видел (`expectedStock`, `expectedPriceMinor`); уменьшение остатка
 * спрашивает причину списания (то же окно, что в редакторе); 409 — «значение изменилось: теперь N», значение НЕ
 * перезаписывается.
 * Запись идёт напрямую через `productApi.quick`, а не через `useApiMutation`: тот тихо отбрасывает второе нажатие
 * «в полёте», и правка второго товара пропала бы, пока первый ещё сохраняется.
 */
import { ApiError, errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { productApi } from "../../api";
import { parsePriceMinor, parseStock, planQuickEdit, withQuickEdit, type QuickEdit } from "../../model/quick-edit";
import { effStock } from "../../model/stock";
import type { AdminProduct } from "../../model/types";
import { productKeys } from "../../keys";
import { fetchFreshProduct } from "../../queries";
import { offerRelease } from "../../release-offer";
import { money } from "@/lib/money";
import { useStockReason } from "../modal/StockReasonDialog";

type Snapshot = [QueryKey, AdminProduct[] | undefined][];

/** Подставить правку в каждый закэшированный список товаров; вернуть снимок для отката. */
function applyOptimistic(qc: QueryClient, p: AdminProduct, edit: QuickEdit): Snapshot {
  const snap = qc.getQueriesData<AdminProduct[]>({ queryKey: productKeys.root() }).filter(([, data]) => Array.isArray(data));
  const next = withQuickEdit(p, edit);
  for (const [key, data] of snap) qc.setQueryData<AdminProduct[]>(key, data?.map((x) => (x.id === p.id ? next : x)));
  return snap;
}

function rollback(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/** После 409: актуальное значение из свежей выгрузки в сообщении; список обновляется. */
async function reportConflict(p: AdminProduct, edit: QuickEdit, message: string, refresh: () => void) {
  refresh();
  try {
    const fresh = await fetchFreshProduct(p.id);
    if (!fresh) throw new Error("gone");
    const now = edit.kind === "price" ? `цена теперь ${money(fresh.priceMinor, fresh.currency)}` : `остаток теперь ${effStock(fresh)} шт`;
    toast.error(`${message}. Значение изменилось: ${now} — проверьте и повторите.`);
  } catch {
    toast.error(message);
  }
}

export function useQuickEdit(refresh: () => void) {
  const qc = useQueryClient();
  const [askReason, reasonUi] = useStockReason();

  /** true — сохранено (или менять нечего); false — не принято, поле остаётся или откатывается. */
  async function apply(p: AdminProduct, edit: QuickEdit, undoable = true): Promise<boolean> {
    const plan = planQuickEdit(p, edit);
    if (!plan.ok) {
      toast.error(plan.error);
      return false;
    }
    if (plan.noop) return true;
    let reason = null;
    if (plan.drop > 0) {
      reason = await askReason(plan.drop);
      if (!reason) return false;
    }
    const snap = applyOptimistic(qc, p, edit);
    try {
      await productApi.quick(p.id, plan.body(reason));
    } catch (e) {
      rollback(qc, snap);
      if (e instanceof ApiError && (e.code === "STOCK_CONFLICT" || e.code === "PRICE_CONFLICT")) await reportConflict(p, edit, e.message, refresh);
      else toast.error(errorMessage(e, undefined, "Не удалось сохранить"));
      return false;
    }
    refresh();
    if (edit.kind === "price") {
      toast.success(`Цена «${p.title}»: ${money(edit.priceMinor, p.currency)}`, {
        action: undoable ? { label: "Отменить", onClick: () => void apply({ ...p, priceMinor: edit.priceMinor }, { kind: "price", priceMinor: p.priceMinor }, false) } : undefined,
      });
    } else {
      toast.success(`Остаток «${p.title}»: ${edit.stock} шт`);
      void offerRelease(qc, p.id, plan.raised);
    }
    return true;
  }

  const savePrice = (p: AdminProduct, raw: string) => {
    const priceMinor = parsePriceMinor(raw);
    if (priceMinor === null) {
      toast.error("Цена — число больше нуля, например 1250 или 1250,50");
      return Promise.resolve(false);
    }
    return apply(p, { kind: "price", priceMinor });
  };

  const saveStock = (p: AdminProduct, raw: string) => {
    const stock = parseStock(raw);
    if (stock === null) {
      toast.error("Остаток — целое число от нуля");
      return Promise.resolve(false);
    }
    return apply(p, { kind: "stock", stock });
  };

  return { savePrice, saveStock, quickEditUi: reasonUi };
}
