"use client";

/** Действия карточки, которые меняют судьбу заказа: возврат, «посылка вернулась», обмен, объединение. */
import { returnsApi, type ExchangeBody, type ReturnReceivedBody, type ReturnWizardBody } from "@/features/returns";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { orderApi, type AdminOrderDetail, type MergeBody } from "../../api";
import { orderKeys } from "../../keys";
import { shortId } from "../../model/status";
import { useInvalidateStock, useRefreshOrderLists, useSetOrderCache } from "../../queries/drawer";
import type { DrawerModals } from "./use-drawer-modals";
import type { RunAction } from "./use-order-actions";

export function useFlowActions(args: { orderId: string | null; run: RunAction; modals: DrawerModals; jumpTo: (id: string) => void }) {
  const { orderId, run, modals, jumpTo } = args;
  const qc = useQueryClient();
  const stock = useInvalidateStock();
  const setOrderCache = useSetOrderCache();
  const refreshLists = useRefreshOrderLists(orderId);
  const { hide } = modals;

  const saveReturn = useCallback(
    async (body: ReturnWizardBody) => {
      const id = orderId;
      if (!id) return;
      // Also MONO_REFUND_FAILED: the bank refused before anything was saved — the wizard stays open.
      const ok = await run("return", () => returnsApi.registerReturn(id, body), "Возврат оформлен", "Не удалось оформить возврат");
      if (!ok) return;
      hide("return");
      stock.products();
      stock.metrics();
    },
    [orderId, run, hide, stock],
  );

  const saveReturnReceived = useCallback(
    async (body: ReturnReceivedBody) => {
      const id = orderId;
      if (!id) return;
      if (await run("return-received", () => returnsApi.receiveReturn(id, body), "Посылка принята, товар на складе")) {
        hide("received");
        stock.products();
      }
    },
    [orderId, run, hide, stock],
  );

  const saveExchange = useCallback(
    async (body: ExchangeBody) => {
      const id = orderId;
      if (!id) return;
      let child: AdminOrderDetail | null = null;
      const ok = await run("exchange", async () => {
        child = await returnsApi.exchange(id, body);
        return child;
      });
      if (ok && child) {
        const c: AdminOrderDetail = child;
        hide("exchange");
        stock.products();
        void qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
        setOrderCache(c);
        toast.success(
          `Обмен оформлен — создан заказ #${c.id.slice(0, 8)}${body.targetStatus === "APPROVED" ? ", ждёт отправки" : " в «Новых»"}`,
        );
        jumpTo(c.id);
      }
    },
    [orderId, run, hide, stock, qc, setOrderCache, jumpTo],
  );

  /** «Объединить»: the other order closes as «Объединён»; the drawer jumps to the one that stays. */
  const saveMerge = useCallback(
    async (targetId: string, body: MergeBody) => {
      const id = orderId;
      if (!id) return;
      let target: AdminOrderDetail | null = null;
      const ok = await run("merge", async () => {
        target = await orderApi.merge(targetId, body);
        return target;
      });
      if (ok && target) {
        const t: AdminOrderDetail = target;
        hide("merge");
        void qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
        void qc.invalidateQueries({
          queryKey: orderKeys.detail(body.sourceId),
        });
        void qc.invalidateQueries({ queryKey: orderKeys.mergeCandidates() });
        setOrderCache(t);
        refreshLists();
        toast.success(`Заказы объединены в ${shortId(t.id)}`);
        if (t.id !== id) jumpTo(t.id);
      }
    },
    [orderId, run, hide, qc, setOrderCache, refreshLists, jumpTo],
  );

  return { saveReturn, saveReturnReceived, saveExchange, saveMerge };
}
