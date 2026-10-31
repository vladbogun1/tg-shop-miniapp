/**
 * Money is stored and transported as integer minor units (kopecks); UAH by default.
 * The backend formats the same way: com.maxsolch.shop.common.MoneyFormat.
 *
 * <p>Both apps and the Telegram cards must agree on rounding — they used to disagree
 * (the backend truncated, the frontends rounded), so an order with kopecks showed a different
 * total in Telegram than in the app.
 */
export function money(
  minor: number | null | undefined,
  currency: string | null = "UAH",
  locale = "ru-RU"
): string {
  const kop = Math.round(minor ?? 0);
  const symbol = currency === "UAH" || currency == null ? "₴" : currency;
  // Kopecks are shown whenever there are any (0,95 ₴ — never "1 ₴" for 95 kopecks: rounding a
  // price up or down misleads the customer); whole amounts stay without decimals (1 030 ₴).
  // Grouping and the decimal sign follow the language; the currency sign does not.
  const text =
    kop % 100 === 0
      ? (kop / 100).toLocaleString(locale, { maximumFractionDigits: 0 })
      : (kop / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ${symbol}`;
}

/** Копеек в гривне (для вычислений над копейками, где toMinor/toMajor с округлением не подходят). */
export const MINOR_PER_MAJOR = 100;

/** Машинная запись суммы для фидов и JSON-LD: «650.00» (точка, два знака, без локали). */
export function priceDecimal(minor: number): string {
  return decimal2(minor / MINOR_PER_MAJOR);
}

/** Число с двумя знаками после точки для машинных форматов («5.00»). */
export function decimal2(value: number): string {
  return value.toFixed(2);
}

/** Major units typed into a form (UAH) → minor units for the API. */
export function toMinor(major: number | string | null | undefined): number {
  const n = typeof major === "string" ? parseFloat(major.replace(",", ".")) : major ?? 0;
  if (!Number.isFinite(n as number)) return 0;
  return Math.round((n as number) * 100);
}

/** Minor units → major number for editing in a form. */
export function toMajor(minor: number | null | undefined): number {
  return Math.round(minor ?? 0) / 100;
}

/** Число в локали (группировка, десятичный знак): `formatNumber(1234.5, "ru-RU")` → «1 234,5». Не деньги — для денег `money()`. */
export function formatNumber(value: number, locale = "ru-RU", options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Средняя оценка с одним знаком после точки («4.5»); единственное место с toFixed для оценок. */
export function formatRating(avg: number): string {
  return avg.toFixed(1);
}
