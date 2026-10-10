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
  /** DELIVERED, paid in full — exchanged for another product (back to NEW, new ТТН). */
  exchange: "e2e0000e-0000-4000-8000-00000000000e",
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
  exchange: "Ольга Обмінна",
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

/** Rows of the specs 23+ (end of fixtures/seed.sql). */
export const EXTRA_PRODUCT = {
  /** On the storefront, READY — hidden / archived by the products-list spec. */
  thermos: "e2e0d001-0000-4000-8000-000000000006",
  /** Old hidden product with card_status AI_FILLED — must not count in the «Карточки» badge. */
  oldPlayer: "e2e0d001-0000-4000-8000-000000000007",
} as const;

export const SEEDED_BRAND = { id: "e2e0a001-0000-4000-8000-000000000001", name: "E2E Logitech", slug: "e2e-logitech" };

/** Customers of the users / metrics specs: names as the admin shows them. */
export const METRICS_USER = {
  zinoviy: { id: 900000201, name: "Зиновій Метриченко", username: "e2e_zinoviy" },
  yaryna: { id: 900000202, name: "Ярина Каналова", username: "e2e_yaryna" },
  stepan: { id: 900000203, name: "Степан Сайтовий", username: "e2e_stepan" },
  fedir: { id: 900000204, name: "Федір Заблокований", username: "e2e_fedir" },
} as const;

/** The March 2025 orders of the metrics spec (the only orders in 2025-03-01 … 2025-03-31). */
export const METRICS_ORDER = {
  m1: "e2e00101-0000-4000-8000-000000000101",
  m2: "e2e00102-0000-4000-8000-000000000102",
  m3: "e2e00103-0000-4000-8000-000000000103",
  m4: "e2e00104-0000-4000-8000-000000000104",
  m5: "e2e00105-0000-4000-8000-000000000105",
} as const;

export const PROMO = {
  reserve: { id: "e2e0aa01-0000-4000-8000-000000000001", code: "E2ERESERVE" },
  full: { id: "e2e0aa01-0000-4000-8000-000000000002", code: "E2EFULL" },
} as const;

export const REVIEW = { tee: 9001, cap: 9002, bag: 9003, published: 9004 } as const;

export const SUPPORT_THREAD = {
  /** OPEN, waiting for an answer, one unread customer message (Степан, about the T-shirt). */
  waiting: "e2e05001-0000-4000-8000-000000000001",
  /** CLOSED general question (Ярина). */
  closed: "e2e05001-0000-4000-8000-000000000002",
} as const;

/** Archived product (its published review must not count on the site). */
export const ARCHIVED_PRODUCT = "e2e0d001-0000-4000-8000-000000000008";
/** Published reviews of a hidden product (9005) and of an archived one (9006). */
export const REVIEW_OFF_SHELF = { hidden: 9005, archived: 9006 } as const;

/** «Персональные скидки» (owner 900000201) and «За отзывы» (REVIEW_BONUS) codes; M5 has a manual discount. */
export const PROMO_OTHER = { personal: "E2EPERSONAL", bonus: "E2EBONUS" } as const;
