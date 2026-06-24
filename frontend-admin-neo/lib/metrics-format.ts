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
/* Neo palette. grid/axis/text are neutral grey so they read on BOTH the light
   cream and dark grey backgrounds (recharts can't read CSS vars). */
export const CHART_COLORS = {
  accent: "#FF5A2C",
  // Status hues — kept in sync with the --st-* tokens in globals.css so charts,
  // the kanban board and status chips all use the same identity. approved
  // (violet) is now clearly distinct from delivered (green).
  new: "#3F8CF5",
  approved: "#9B6BFF",
  shipped: "#F5A623",
  delivered: "#22C07D",
  rejected: "#F0503C",
  grid: "rgba(128,128,128,0.28)",
  axis: "#8b8b8b",
  text: "#8b8b8b",
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
  "#FF5A2C",
  "#2F6BFF",
  "#16B36B",
  "#E8A300",
  "#12B886",
  "#E5341F",
  "#7B5Cff",
  "#FF73B5",
];
