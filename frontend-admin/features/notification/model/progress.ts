/** «100 %» — проценты рассылки; к деньгам отношения не имеет. */
const FULL_PERCENT = 100;

/** Сколько процентов рассылки обработано: целое, ближе к ближайшему; пустая аудитория — 0. */
export function progressPercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * FULL_PERCENT) : 0;
}
