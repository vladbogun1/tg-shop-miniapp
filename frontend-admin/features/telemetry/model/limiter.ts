/**
 * Ограничитель отправки на клиенте: не больше `perMinute` событий за скользящую минуту и одно и то же событие
 * (ключ = вид + сообщение + экран) не чаще раза в `dedupeMs`. Время передаётся снаружи — функция чистая.
 */
export interface Limiter {
  /** `true` — событие можно ставить в очередь (и оно уже учтено). */
  allow(key: string, nowMs: number): boolean;
}

export interface LimiterOptions {
  perMinute?: number;
  dedupeMs?: number;
}

const MINUTE = 60_000;
const MAX_KEYS = 200;

export function createLimiter({ perMinute = 30, dedupeMs = 60_000 }: LimiterOptions = {}): Limiter {
  const sentAt: number[] = [];
  const lastByKey = new Map<string, number>();

  function forgetOld(nowMs: number): void {
    while (sentAt.length > 0 && (sentAt[0] ?? 0) <= nowMs - MINUTE) sentAt.shift();
    if (lastByKey.size > MAX_KEYS) {
      lastByKey.forEach((at, k) => {
        if (at <= nowMs - dedupeMs) lastByKey.delete(k);
      });
    }
  }

  return {
    allow(key, nowMs) {
      forgetOld(nowMs);
      const last = lastByKey.get(key);
      if (last !== undefined && nowMs - last < dedupeMs) return false;
      if (sentAt.length >= perMinute) return false;
      sentAt.push(nowMs);
      lastByKey.set(key, nowMs);
      return true;
    },
  };
}
