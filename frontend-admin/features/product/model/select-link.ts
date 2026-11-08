/**
 * Ссылка «/products?select=a,b» (с поставки: «Выложить скрытые»): список открывается на «Скрытых» с этими товарами
 * уже выбранными — дальше обычное массовое «Показать» с отчётом, кого не выложить и почему.
 */
export const SELECT_PARAM = "select";

export function productsSelectHref(productIds: string[]): string {
  return `/products?${SELECT_PARAM}=${productIds.map(encodeURIComponent).join(",")}`;
}

/** Из ссылки — только товары, которые есть в списке, без повторов. */
export function selectedFromParam(raw: string | null, known: ReadonlySet<string>): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((x) => x.trim()).filter((x) => known.has(x)))];
}
