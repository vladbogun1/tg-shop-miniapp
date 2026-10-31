"use client";

/**
 * Действия карточки заказа: статус, оплата, состав, ТТН, доставка, архив, кейс.
 * Каждое идёт через общий `run` (одно за раз, свой спиннер, тост, обновление списков).
 */
import { caseDiscountText, type CaseTier } from "@shop/core/giftcase";
import type { OrderStatus } from "@shop/core/types";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { useCallback } from "react";
import { paymentApi, type MovementChannel } from "@/features/payment";
import { CASE_RARITY_LABEL } from "@/features/gift";
import { money } from "@/lib/money";
import { changeStatusConfirmingUnpaid, orderApi, type DeliveryPatch } from "../../api";
import { needsModal } from "../../model/drawer-rules";
import { STATUS_LABEL } from "../../model/status";
import { useInvalidateStock } from "../../queries/drawer";
import type { StatusChangePayload } from "../modals/StatusChangeModal";
import type { DrawerModals } from "./use-drawer-modals";

export type RunAction = (key: string, fn: () => Promise<unknown>, okText?: string, errText?: string) => Promise<boolean>;

export interface OrderActionsArgs {
  orderId: string | null;
  run: RunAction;
  modals: DrawerModals;
  /** Закрыть карточку тем же путём, что ×: убирает запись истории. */
  close: () => void;
}

export function useOrderActions({ orderId, run, modals, close }: OrderActionsArgs) {
  const confirm = useConfirm();
  const stock = useInvalidateStock();
  const { hide, setPendingTarget } = modals;

  const applyStatus = useCallback(
    async (payload: StatusChangePayload): Promise<boolean> => {
      const id = orderId;
      if (!id) {
        toast.error("Заказ не выбран — откройте его заново");
        return false;
      }
      // SHIPPED without the online payment asks the admin first (server code ORDER_UNPAID_SHIP).
      let declined = false;
      const ok = await run(
        `status:${payload.status}`,
        async () => {
          const updated = await changeStatusConfirmingUnpaid(id, payload, confirm);
          if (updated === null) declined = true;
          return updated;
        },
        undefined,
        "Ошибка смены статуса",
      );
      if (ok && !declined) {
        toast.success(`Статус: ${STATUS_LABEL[payload.status]}`);
        setPendingTarget(null);
        stock.products();
      }
      return ok && !declined;
    },
    [orderId, run, confirm, setPendingTarget, stock],
  );

  const requestStatus = useCallback(
    (target: OrderStatus) => {
      if (needsModal(target)) setPendingTarget(target);
      else void applyStatus({ status: target });
    },
    [applyStatus, setPendingTarget],
  );

  const applyPayment = useCallback(
    async (receivedMinor: number, channel?: MovementChannel, note?: string): Promise<boolean> => {
      const id = orderId;
      if (!id) return false;
      const ok = await run(
        "pay",
        () =>
          paymentApi.setPaid(id, {
            receivedMinor,
            channel: receivedMinor > 0 ? channel : undefined,
            note,
          }),
        receivedMinor > 0 ? "Оплата обновлена" : "Оплата снята",
        "Ошибка смены оплаты",
      );
      if (ok) hide("pay");
      return ok;
    },
    [orderId, run, hide],
  );

  const removeItem = useCallback(
    async (itemId: number, title: string) => {
      const id = orderId;
      if (!id) return;
      const ok = await confirm({
        title: "Убрать позицию?",
        message: `«${title}» исчезнет из заказа, остаток вернётся на склад, сумма заказа пересчитается.`,
        confirmLabel: "Убрать",
        danger: true,
      });
      if (!ok) return;
      await run(`item:${itemId}`, () => orderApi.removeItem(id, itemId), "Позиция убрана", "Не удалось убрать");
      stock.products();
    },
    [orderId, run, confirm, stock],
  );

  const changeQty = useCallback(
    async (itemId: number, quantity: number) => {
      const id = orderId;
      if (!id || quantity < 1) return;
      await run(
        `item:${itemId}`,
        () =>
          orderApi.changeItemQty(id, itemId, {
            quantity,
            notifyCustomer: false,
          }),
        undefined,
        "Не удалось изменить количество",
      );
      stock.products();
    },
    [orderId, run, stock],
  );

  const saveTracking = useCallback(
    async (ttn: string) => {
      const id = orderId;
      if (!id) return;
      if (await run("tracking", () => orderApi.updateTracking(id, ttn), "ТТН обновлена, клиент уведомлён")) hide("tracking");
    },
    [orderId, run, hide],
  );

  const saveDelivery = useCallback(
    async (patch: DeliveryPatch) => {
      const id = orderId;
      if (!id) return;
      if (await run("delivery", () => orderApi.updateDelivery(id, patch), "Данные доставки обновлены")) hide("delivery");
    },
    [orderId, run, hide],
  );

  const applyArchive = useCallback(
    async (reason: string) => {
      const id = orderId;
      if (!id) return;
      if (await run("archive", () => orderApi.archive(id, reason), "Заказ в архиве", "Не удалось архивировать")) {
        hide("archive");
        stock.metrics();
        close();
      }
    },
    [orderId, run, hide, stock, close],
  );

  const applyUnarchive = useCallback(async () => {
    const id = orderId;
    if (!id) return;
    const ok = await confirm({
      title: "Вернуть из архива?",
      message: "Заказ снова появится в таблице и на доске.",
      confirmLabel: "Вернуть",
    });
    if (!ok) return;
    await run("unarchive", () => orderApi.unarchive(id), "Заказ возвращён из архива", "Не удалось вернуть из архива");
    stock.metrics();
  }, [orderId, run, confirm, stock]);

  /** «🎁 Выдать кейс»: the server draws the prize now; the toast names it. */
  const grantCase = useCallback(
    async (tier: CaseTier, notifyCustomer: boolean) => {
      const id = orderId;
      if (!id) return;
      let prize = "";
      const ok = await run(
        "gift-case",
        async () => {
          const updated = await orderApi.grantGiftCase(id, tier, notifyCustomer);
          const it = updated.items.find((x) => x.gift && x.caseRarity);
          const won = updated.gift?.prize;
          if (it?.caseRarity) prize = `${it.title} · ${CASE_RARITY_LABEL[it.caseRarity]}`;
          else if (won?.kind === "DISCOUNT") {
            prize = `скидка ${caseDiscountText(won, (m) => money(m, updated.currency))} · ${CASE_RARITY_LABEL[won.rarity]}`;
          }
          return updated;
        },
        undefined,
        "Не удалось выдать кейс",
      );
      if (ok) {
        toast.success(prize ? `Выпало: ${prize}` : "Кейс выдан");
        hide("case");
        stock.products();
      }
    },
    [orderId, run, hide, stock],
  );

  return {
    applyStatus,
    requestStatus,
    applyPayment,
    removeItem,
    changeQty,
    saveTracking,
    saveDelivery,
    applyArchive,
    applyUnarchive,
    grantCase,
  };
}
