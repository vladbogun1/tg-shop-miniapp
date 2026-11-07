/**
 * Правдоподобие числа против соседей (других товаров той же категории): модель путает единицы («256 ГБ» → 256000).
 * Чистая логика. Красное нельзя применить, жёлтое — на усмотрение человека.
 */
export type Plausibility = "ok" | "warn" | "bad";

/** Соседей меньше — судить не о чем. */
export const MIN_NEIGHBORS = 3;
const WARN_RATIO = 10;
const BAD_RATIO = 100;

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Во сколько раз значение отличается от медианы соседей (всегда ≥ 1); null — сравнивать нельзя. */
export function ratioToNeighbors(value: number, neighbors: number[]): number | null {
  const usable = neighbors.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (usable.length < MIN_NEIGHBORS || !Number.isFinite(value) || value <= 0) return null;
  const m = median(usable);
  return value >= m ? value / m : m / value;
}

export function plausibility(value: number, neighbors: number[]): Plausibility {
  const ratio = ratioToNeighbors(value, neighbors);
  if (ratio === null) return "ok";
  if (ratio >= BAD_RATIO) return "bad";
  return ratio >= WARN_RATIO ? "warn" : "ok";
}

/** Причина простыми словами для строки поля; null — всё в порядке. */
export function plausibilityReason(value: number, neighbors: number[]): string | null {
  const level = plausibility(value, neighbors);
  if (level === "ok") return null;
  const usable = neighbors.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const typical = median(usable);
  const shown = (n: number) => String(Math.round(n * 100) / 100);
  return level === "bad"
    ? `Единицы? У других товаров этой категории около ${shown(typical)}, тут ${shown(value)}`
    : `Сильно отличается от других товаров категории: у них около ${shown(typical)}, тут ${shown(value)}`;
}
