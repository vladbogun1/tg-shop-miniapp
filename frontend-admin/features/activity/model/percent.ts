/** Проценты — доля от целого, а не деньги: основание 100 названо, чтобы не путать с minor-единицами. */
const PERCENT_BASE = 100;

/** Доля `part` в `total`, целым процентом (как полоска «доставлено / не доставлено»). */
export function sharePercent(part: number, total: number): number {
  return Math.round((part / total) * PERCENT_BASE);
}
