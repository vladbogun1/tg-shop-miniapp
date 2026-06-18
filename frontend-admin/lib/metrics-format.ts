/**
 * Formatting helpers for the metrics dashboard (charts + cards).
 */

/** yyyy-MM-dd -> dd.MM (axis/tooltip labels). */
export function shortDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** minor units -> "1 234 ₴" (rounded major). */
export function moneyShort(minor: number | null | undefined, currency = "UAH"): string {
  const major = Math.round((minor ?? 0) / 100);
  const symbol = currency === "UAH" ? "₴" : currency;
  return `${major.toLocaleString("ru-RU")} ${symbol}`;
}

/** Hours value -> "12.5 ч" or "—" when null/0. */
export function hoursLabel(h: number | null | undefined): string {
  if (h == null || h === 0) return "—";
  const rounded = Math.round(h * 10) / 10;
  return `${rounded.toLocaleString("ru-RU")} ч`;
}

/**
 * Palette for charts — pulled from the Liquid Glass status accents so charts
 * theme to the dark glass. These are literal values (recharts can't read CSS
 * vars from JS), kept in sync with globals.css :root.
 */
export const CHART_COLORS = {
  accent: "#5ac8fa",
  new: "#5ac8fa",
  approved: "#34c759",
  shipped: "#ff9f0a",
  delivered: "#30d158",
  rejected: "#ff453a",
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.4)",
  text: "rgba(255,255,255,0.96)",
} as const;

/** Status -> chart color, matching the kanban accents. */
export const STATUS_COLOR: Record<string, string> = {
  NEW: CHART_COLORS.new,
  APPROVED: CHART_COLORS.approved,
  SHIPPED: CHART_COLORS.shipped,
  DELIVERED: CHART_COLORS.delivered,
  REJECTED: CHART_COLORS.rejected,
};

/** A small rotating palette for categorical series (top products, payments). */
export const SERIES_PALETTE = [
  "#5ac8fa",
  "#34c759",
  "#ff9f0a",
  "#30d158",
  "#bf5af2",
  "#64d2ff",
  "#ffd60a",
  "#ff453a",
];
