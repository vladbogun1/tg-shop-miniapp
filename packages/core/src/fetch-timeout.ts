/**
 * `fetch` с таймаутом.
 *
 * Без таймаута зависший бэкенд или «полумёртвая» сеть (iPhone в метро) оставляют экран на вечной
 * загрузке. `AbortSignal.timeout`/`AbortSignal.any` есть только в Safari 16+/Chrome 116+, а мы держим
 * iOS 15.4 и Chrome 92 — поэтому `AbortController` + `setTimeout`.
 *
 * Таймер живёт, пока вызывающий не вызвал `done()`: зависшее чтение тела ответа — тоже зависание.
 */

export interface TimedFetch {
  res: Response;
  /** Снять таймер. Вызывать после того, как тело ответа прочитано (или не нужно). */
  done: () => void;
}

/** Таймаут сработал (а не отмена вызывающего и не сбой сети). */
export class FetchTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`request timed out after ${timeoutMs} ms`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<TimedFetch> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  const done = () => {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  };

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, done };
  } catch (e) {
    done();
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw e;
  }
}
