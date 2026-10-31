/** Ключи кэша «Внимания». Значение то же, что `orderKeys.inbox()` (по нему инвалидирует и заказ). */
export const inboxKeys = {
  all: () => ["admin", "inbox"] as const,
};
