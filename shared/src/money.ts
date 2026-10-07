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
  currency = "UAH",
  locale = "ru-RU"
): string {
  const kop = Math.round(minor ?? 0);
  const symbol = currency === "UAH" ? "₴" : currency;
  // Kopecks are shown whenever there are any (0,95 ₴ — never "1 ₴" for 95 kopecks: rounding a
  // price up or down misleads the customer); whole amounts stay without decimals (1 030 ₴).
  // Grouping and the decimal sign follow the language; the currency sign does not.
  const text =
    kop % 100 === 0
      ? (kop / 100).toLocaleString(locale, { maximumFractionDigits: 0 })
      : (kop / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ${symbol}`;
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
