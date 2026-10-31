/**
 * What the customer sees is translated; what the SELLER receives is always the Russian wording.
 * The cancellation reason lands on the admin board and in a Telegram card, and a board where every
 * third reason is in a different language is harder to scan than it is worth.
 */
export const CANCEL_REASONS = [
  { id: "payment", ru: "Проблема с оплатой / картой" },
  { id: "changedMind", ru: "Передумал(а)" },
  { id: "mistake", ru: "Оформил(а) по ошибке" },
  { id: "cheaper", ru: "Нашёл(ла) дешевле" },
  { id: "other", ru: "Другое" },
] as const;

export type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];
