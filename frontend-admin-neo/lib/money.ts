/**
 * Den'gi — tselye minornye edinitsy (*_minor), valyuta po umolchaniyu UAH.
 * (docs/SPEC.md "Den'gi"). Otobrazhaemye tseny okruglyaem do tselogo UAH.
 */
export function money(minor: number | null | undefined, currency = "UAH"): string {
  const major = Math.round((minor ?? 0) / 100);
  const symbol = currency === "UAH" ? "₴" : currency;
  const grouped = major.toLocaleString("ru-RU");
  return `${grouped} ${symbol}`;
}

/** Major units (UAH) entered in a form -> minor (kopecks). */
export function toMinor(major: number | string | null | undefined): number {
  const n = typeof major === "string" ? parseFloat(major.replace(",", ".")) : major ?? 0;
  if (!Number.isFinite(n as number)) return 0;
  return Math.round((n as number) * 100);
}

/** Minor units -> major number for editing in a form. */
export function toMajor(minor: number | null | undefined): number {
  return Math.round((minor ?? 0)) / 100;
}
