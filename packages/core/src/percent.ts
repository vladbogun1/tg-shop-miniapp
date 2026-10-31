/** Основание процентов: «из 100». */
export const PERCENT_BASE = 100;

/** Доля (0…1) → проценты (0…100). Не деньги: уверенность ИИ, похожесть текстов, ширина полосы. `100 * x` и `x * 100` дают одни и те же биты. */
export function toPercent(ratio: number): number {
  return 100 * ratio;
}
