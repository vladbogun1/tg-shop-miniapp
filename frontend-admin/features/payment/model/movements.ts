// ---- money journal (V68) -----------------------------------------------------

export type MovementKind = "PAYMENT" | "REFUND" | "RETAINED" | "CORRECTION";
export type MovementChannel =
  | "MONO"
  | "NP_COD"
  | "NP_PAYMENT_CONTROL"
  | "CARD_TRANSFER"
  | "CASH"
  | "NP_CLAIM"
  | "OTHER"
  | "EXCHANGE"
  | "MERGE";

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  PAYMENT: "Пришло",
  REFUND: "Вернули",
  RETAINED: "Удержано",
  CORRECTION: "Исправление",
};

export const MOVEMENT_CHANNEL_LABEL: Record<MovementChannel, string> = {
  MONO: "Карта (monobank)",
  NP_COD: "Наложка НП",
  NP_PAYMENT_CONTROL: "Контроль оплаты НП",
  CARD_TRANSFER: "Перевод на карту",
  CASH: "Наличные",
  NP_CLAIM: "Претензия НП",
  OTHER: "Другое",
  EXCHANGE: "Зачёт в обмен",
  MERGE: "Перенос при объединении",
};

/** How money came in (PATCH …/paid): by hand, without monobank (credited by the bank itself). */
export const PAID_CHANNELS: { value: MovementChannel; label: string }[] = [
  { value: "NP_COD", label: "Наложка НП" },
  { value: "NP_PAYMENT_CONTROL", label: "Контроль оплаты НП" },
  { value: "CARD_TRANSFER", label: "Перевод на карту" },
  { value: "CASH", label: "Наличные" },
  { value: "OTHER", label: "Другое" },
];

/** How money goes back by hand (return wizard): without monobank — that is its own field. */
export const REFUND_CHANNELS: { value: MovementChannel; label: string }[] = [
  { value: "CARD_TRANSFER", label: "Перевод на карту" },
  { value: "CASH", label: "Наличные" },
  { value: "NP_COD", label: "Наложка НП (возврат)" },
  { value: "NP_PAYMENT_CONTROL", label: "Контроль оплаты НП" },
  { value: "NP_CLAIM", label: "Претензия НП" },
  { value: "OTHER", label: "Другое" },
];
