import type { ComponentType } from "react";

/** Props of the order drawer the inbox opens on top of itself. */
export interface OrderDrawerProps {
  orderId: string | null;
  initialTab?: "details" | "chat";
  initialAction?: "payment";
  onClose: () => void;
}

/**
 * Что «Внимание» берёт у фичи «заказ»: карточка заказа и «Прочитать всё». Передаётся со страницы, а не
 * импортируется: цепочка заказ → товар → поддержка → «Внимание» иначе замкнулась бы в цикл.
 */
export interface InboxOrderSlot {
  OrderDrawer: ComponentType<OrderDrawerProps>;
  markAllRead: () => Promise<{ marked: number } | undefined>;
  /** Ключ доски заказов — устаревает после «Прочитать всё». */
  boardKey: readonly unknown[];
}
