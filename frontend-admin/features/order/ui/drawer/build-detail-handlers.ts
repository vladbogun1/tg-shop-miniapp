import type { Ref } from "react";
import type { AdminOrderDetail } from "../../api";
import type { DrawerRules } from "../../model/drawer-rules";
import type { DetailHandlers } from "../details/types";
import type { ModalName } from "./use-drawer-modals";
import type { useOrderActions } from "./use-order-actions";

/** Что «Детали» могут делать с заказом: каждая кнопка открывает окно или запускает действие; недоступные — undefined. */
export function buildDetailHandlers(args: {
  order: AdminOrderDetail | undefined;
  rules: DrawerRules;
  canMerge: boolean;
  busyKey: string | null;
  actions: ReturnType<typeof useOrderActions>;
  show: (name: ModalName) => void;
  openOrder: (id: string) => void;
  openCustomer: () => void;
  openProduct: (id: string) => void;
  onPaymentChanged: () => void;
  paymentRef: Ref<HTMLElement>;
}): DetailHandlers {
  const { order, rules, canMerge, actions, show } = args;
  return {
    busyKey: args.busyKey,
    onChangeQty: actions.changeQty,
    onRemoveItem: actions.removeItem,
    onAddItem: () => show("gift"),
    onGiftCase: () => show("case"),
    onDiscount: () => show("discount"),
    onEditDelivery: () => show("delivery"),
    onEditTracking: () => show("tracking"),
    onOpenCustomer: order?.tgUserId ? args.openCustomer : undefined,
    onReturn: rules.canReturn ? () => show("return") : undefined,
    onReturnReceived: rules.inTransit ? () => show("received") : undefined,
    onUnarchive: rules.canUnarchive ? () => void actions.applyUnarchive() : undefined,
    onExchange: rules.canExchange ? () => show("exchange") : undefined,
    onMerge: canMerge ? () => show("merge") : undefined,
    onOpenOrder: args.openOrder,
    onOpenProduct: args.openProduct,
    onPaymentChanged: args.onPaymentChanged,
    paymentRef: args.paymentRef,
  };
}
