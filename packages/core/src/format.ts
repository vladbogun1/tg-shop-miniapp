/** Форматирование идентификаторов. Даты — в `./time`, деньги — в `./money`. */

/** "#abcd1234" — первые 8 hex-символов, так заказ называют везде. */
export function shortOrderId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 8);
}
