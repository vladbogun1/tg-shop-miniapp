/**
 * Зависание главного потока по «сердцебиению»: таймер раз в секунду, тик опоздал на ≥ 2 с — поток стоял.
 *
 * iOS усыпляет страницу в фоне (свернули приложение, погас экран) — тогда тик тоже «опаздывает», но это не
 * зависание. Поэтому считаем только пару тиков, где оба видимы и между ними не было смены видимости
 * (`epoch` растёт на каждом visibilitychange и на pageshow из bfcache).
 */
export interface Tick {
  /** `performance.now()` — монотонное время, не зависит от перевода часов. */
  at: number;
  visible: boolean;
  epoch: number;
}

export const HEARTBEAT_MS = 1000;
export const FREEZE_THRESHOLD_MS = 2000;

/** Сколько мс поток стоял между тиками, или `null`, если это не зависание (или его не видно). */
export function stallOf(prev: Tick | null, cur: Tick, intervalMs = HEARTBEAT_MS, thresholdMs = FREEZE_THRESHOLD_MS): number | null {
  if (!prev || !prev.visible || !cur.visible || prev.epoch !== cur.epoch) return null;
  const late = cur.at - prev.at - intervalMs;
  return late >= thresholdMs ? Math.round(late) : null;
}
