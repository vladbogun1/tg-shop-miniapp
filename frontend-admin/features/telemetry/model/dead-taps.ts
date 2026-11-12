/**
 * «Злые тапы»: ≥ 4 тапа за 2 с в круге 40 px, и за это время не было ни перехода, ни запроса в сеть — экран
 * не отвечает. Одна серия = одно событие: пока пальцы продолжают стучать (паузы < 2 с), повторно не сообщаем.
 */
export interface Tap {
  x: number;
  y: number;
  /** мс, монотонное время */
  at: number;
  /** счётчик переходов (смена экрана) на момент тапа */
  nav: number;
  /** счётчик начатых запросов на момент тапа */
  net: number;
}

export interface DeadTapOptions {
  count?: number;
  windowMs?: number;
  radiusPx?: number;
}

export interface DeadTapDetector {
  /** Серия тапов, если этот тап её завершил; иначе `null`. */
  push(tap: Tap): Tap[] | null;
}

export function createDeadTapDetector({ count = 4, windowMs = 2000, radiusPx = 40 }: DeadTapOptions = {}): DeadTapDetector {
  let taps: Tap[] = [];
  let burstLastAt: number | null = null;

  return {
    push(tap) {
      if (burstLastAt !== null && tap.at - burstLastAt <= windowMs) {
        burstLastAt = tap.at; // та же серия, о ней уже сообщили
        return null;
      }
      burstLastAt = null;
      taps = taps.filter(
        (p) => tap.at - p.at <= windowMs && p.nav === tap.nav && p.net === tap.net && Math.hypot(p.x - tap.x, p.y - tap.y) <= radiusPx
      );
      taps.push(tap);
      if (taps.length < count) return null;
      const burst = taps;
      taps = [];
      burstLastAt = tap.at;
      return burst;
    },
  };
}
