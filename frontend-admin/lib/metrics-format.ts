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

/**
 * Chart palette for JS-only places (recharts props that can't read CSS vars, e.g. <Cell fill>,
 * gradient <stop>s). Literal mirror of the --mx-* tokens in components/metrics/metrics.css and
 * the --st-* tokens in app/globals.css — ChiSetup dark (DESIGN-V3 §8): orange is the series
 * that matters, steel / greys are context, status hues only for statuses.
 */
export const CHART_COLORS = {
  accent: "#FF6600",
  steel: "#7B93B8",
  grey: "#D4D4D8",
  prev: "#8A8A93",
  // Status hues — identical to the --st-* tokens, so charts, the board and the chips agree.
  new: "#3F8CF5",
  approved: "#9B6BFF",
  shipped: "#F5A623",
  delivered: "#22C07D",
  rejected: "#F0503C",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.4)",
  text: "#A1A1AA",
  /** Tooltip cursor band / hover fill. */
  cursor: "rgba(255,255,255,0.04)",
} as const;

/**
 * Categorical order for part-of-whole charts (sources, languages, payment methods). Fixed order,
 * never cycled past the end: a 9th category belongs in «Другое». Orange first, then neutrals with
 * clear lightness steps so neighbours separate without hue (validated: adjacent ΔE ≥ 15).
 * For a single-series ranking (top products) use ONE colour (accent), not this list.
 */
export const SERIES_PALETTE = [
  "#FF6600",
  "#7B93B8",
  "#D4D4D8",
  "#FFA766",
  "#4E5D75",
  "#8A8A93",
  "#B04F07",
  "#55555C",
];
