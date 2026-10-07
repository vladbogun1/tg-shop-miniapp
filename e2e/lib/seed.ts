/**
 * Ids and facts of e2e/fixtures/seed.sql that the specs rely on. Each spec owns its orders /
 * products, so specs do not depend on each other's side effects.
 */
export const ORDER = {
  /** NEW, 150 ₴ prepayment, nothing paid, no online deadline — manual payment correction. */
  prepay: "e2e00001-0000-4000-8000-000000000001",
  /** NEW, 150 ₴ online prepayment due (invoice «Ссылка выдана»), 5 h old — «Ждёт оплаты», NEW_STALE, dispatch. */
  awaiting: "e2e00002-0000-4000-8000-000000000002",
  /** NEW, unread customer message, customer locale ru — inbox CHAT, reply templates. */
  chat: "e2e00003-0000-4000-8000-000000000003",
  /** NEW, 6 h old — inbox NEW_STALE (snooze). */
  stale: "e2e00004-0000-4000-8000-000000000004",
  /** NEW → APPROVED → SHIPPED. */
  flow: "e2e00005-0000-4000-8000-000000000005",
  /** APPROVED — the "next order" whose ТТН field must be empty. */
  approved: "e2e00006-0000-4000-8000-000000000006",
  /** APPROVED, paid in full — shipped from «Отправка». */
  dispatch: "e2e00007-0000-4000-8000-000000000007",
  /** NEW — rejected with a reason. */
  reject: "e2e00008-0000-4000-8000-000000000008",
  /** DELIVERED, paid — partial return. */
  delivered: "e2e00009-0000-4000-8000-000000000009",
  /** REJECTED after shipping (refused at the post office) — inbox RETURN (dismissible). */
  refused: "e2e0000a-0000-4000-8000-00000000000a",
  /** SHIPPED — read-only board target. */
  shipped: "e2e0000b-0000-4000-8000-00000000000b",
  /** NEW — status changed through the API by the journal spec. */
  audit: "e2e0000c-0000-4000-8000-00000000000c",
  /** NEW, 150 ₴ prepayment paid online (monobank invoice, card •••• 1902) — inbox PAYMENT, refund dialog. */
  paidOnline: "e2e0000d-0000-4000-8000-00000000000d",
} as const;

export const CUSTOMER: Record<keyof typeof ORDER, string> = {
  prepay: "Олена Тестова",
  awaiting: "Петро Вигаданий",
  chat: "Марія Чатова",
  stale: "Іван Застряглий",
  flow: "Оксана Статусна",
  approved: "Тарас Схвалений",
  dispatch: "Ганна Відправка",
  reject: "Богдан Відмова",
  delivered: "Світлана Повернення",
  refused: "Юрій Відмовник",
  shipped: "Андрій Посилка",
  audit: "Лариса Журнальна",
  paidOnline: "Віра Онлайн",
};

export const PRODUCT = {
  tee: "e2e0d001-0000-4000-8000-000000000001",
  cap: "e2e0d001-0000-4000-8000-000000000002",
  bag: "e2e0d001-0000-4000-8000-000000000003",
  /** Only the product specs touch these two. */
  socks: "e2e0d001-0000-4000-8000-000000000004",
  scarf: "e2e0d001-0000-4000-8000-000000000005",
} as const;

/** "#e2e00005" — how the admin shows an order number. */
export function shortId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 8);
}

/** Same formatting as @shop/shared money(): "1 299 ₴" (ru-RU grouping, rounded to whole hryvnias). */
export function money(minor: number): string {
  return `${Math.round(minor / 100).toLocaleString("ru-RU")} ₴`;
}
