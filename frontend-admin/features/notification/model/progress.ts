/** «100 %» — проценты рассылки; к деньгам отношения не имеет. */
const FULL_PERCENT = 100;

/** Сколько процентов рассылки обработано: целое, ближе к ближайшему; пустая аудитория — 0. */
export function progressPercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * FULL_PERCENT) : 0;
}

interface PlateText { running: boolean; stopRequested: boolean; stopped: boolean }

/** Заголовок плашки прогресса: идёт / останавливается / остановлена / завершена. */
export function progressTitle({ running, stopRequested, stopped }: PlateText): string {
  if (running) return stopRequested ? "Останавливаем рассылку…" : "Идёт рассылка…";
  return stopped ? "Рассылка остановлена" : "Рассылка завершена";
}

/** «Остановлена: отправлено 612 из 1 225, не ушло 613» — сколько осталось неотправленным. */
export function stoppedSummary(done: number, total: number, sent: number): string {
  return `Отправлено ${sent} из ${total}, не ушло ${Math.max(0, total - done)}`;
}
