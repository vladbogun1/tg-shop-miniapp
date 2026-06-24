/**
 * Den'gi — tselye minornye edinitsy (*_minor), valyuta po umolchaniyu UAH.
 * (docs/SPEC.md "Den'gi"). Otobrazhaemye tseny okruglyaem do tselogo UAH.
 */
export function money(minor: number | null | undefined, currency = "UAH"): string {
  const major = Math.round((minor ?? 0) / 100);
  const symbol = currency === "UAH" ? "₴" : currency; // ₴
  // Probel mezhdu tysyachami: 1 250 ₴
  const grouped = major.toLocaleString("ru-RU");
  return `${grouped} ${symbol}`;
}
