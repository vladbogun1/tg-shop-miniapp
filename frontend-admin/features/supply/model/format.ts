/** Число с одним знаком после запятой, десятичная запятая («12,3»): размер файла в МБ, маржа в %. Не деньги. */
export function decimal1(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(n).replace(".", ",");
}

/** Маржа в процентах от цены: (цена − себестоимость) / цена × 100. Вызывающий сам проверяет, что цена > 0. */
export function marginPercent(priceMinor: number, costMinor: number): number {
  return 100 * ((priceMinor - costMinor) / priceMinor);
}

/**
 * Сколько обойдётся 1 шт, если приедет `qty` шт: закупка за штуку + расходы строки, поделённые на пришедшее.
 * Оценка для окна «Приехала» (точную считает сервер после прихода); null — нечего считать.
 */
export function arrivedUnitCost(purchaseUnitMinor: number | null, extraLineMinor: number, qty: number): number | null {
  if (purchaseUnitMinor == null || !(qty > 0)) return null;
  return purchaseUnitMinor + Math.round(extraLineMinor / qty);
}

/** «2026-11-05» → «05.11.2026»; другое — как есть. */
export function dayOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
