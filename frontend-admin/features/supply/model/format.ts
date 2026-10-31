/** Число с одним знаком после запятой, десятичная запятая («12,3»): размер файла в МБ, маржа в %. Не деньги. */
export function decimal1(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(n).replace(".", ",");
}

/** Маржа в процентах от цены: (цена − себестоимость) / цена × 100. Вызывающий сам проверяет, что цена > 0. */
export function marginPercent(priceMinor: number, costMinor: number): number {
  return 100 * ((priceMinor - costMinor) / priceMinor);
}
