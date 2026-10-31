import type { Ref } from "react";

export interface DetailHandlers {
  busyKey: string | null;
  onChangeQty: (id: number, qty: number) => void;
  onRemoveItem: (id: number, title: string) => void;
  onAddItem: () => void;
  /** «🎁 Выдать кейс» (editable orders without a case): opens the confirm dialog. */
  onGiftCase?: () => void;
  onDiscount: () => void;
  onEditDelivery: () => void;
  onEditTracking: () => void;
  onOpenCustomer?: () => void;
  onReturn?: () => void;
  /** Exchange goods (delivered orders): the replacement goes out as a new linked order. */
  onExchange?: () => void;
  /** «Объединить заказы» (NEW / APPROVED): another order of the same customer joins this one. */
  onMerge?: () => void;
  /** Open another order in the same drawer (the two sides of an exchange or a merge). */
  onOpenOrder?: (id: string) => void;
  /** Tap on a line's photo or title: the product's quick view (the same panel as on a supply page). */
  onOpenProduct?: (productId: string) => void;
  /** «Посылка вернулась» — only while the refused parcel is on its way back. */
  onReturnReceived?: () => void;
  /** «Вернуть из архива» — main admin only, archived orders. */
  onUnarchive?: () => void;
  /** Invoices refreshed or refunded — reload the order and the lists. */
  onPaymentChanged?: () => void;
  /** The «Онлайн-оплата» section, to scroll to it («Внимание» → «Оплаты»). */
  paymentRef?: Ref<HTMLElement>;
}
