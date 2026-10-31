import type { InboxOrderSlot } from "@/features/inbox";
import { OrderDrawer, orderApi, orderKeys } from "@/features/order";

/** «Внимание» не импортирует фичу «заказ» (цикл через товар и поддержку) — всё нужное приходит отсюда. */
export const orderSlot: InboxOrderSlot = {
  OrderDrawer,
  markAllRead: () => orderApi.markAllRead(),
  boardKey: orderKeys.board(),
};
