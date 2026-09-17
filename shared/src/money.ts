/**
 * Money is stored and transported as integer minor units (kopecks); UAH by default.
 *
 * <p>Both apps and the Telegram cards must agree on rounding — they used to disagree
 * (the backend truncated, the frontends rounded), so an order with kopecks showed a different
 * total in Telegram than in the app.
 */
export function money(minor: number | null | undefined, currency = "UAH"): string {
  const major = Math.round((minor ?? 0) / 100);
  const symbol = currency === "UAH" ? "₴" : currency;
  return `${major.toLocaleString("ru-RU")} ${symbol}`;
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
