/**
 * Очередь телеметрии админки: лимиты, хлебные крошки, нарезка на пачки. Без DOM и без сети — их дают снаружи
 * (`deps`), поэтому правило проверяется юнитом. Ничего не бросает: телеметрия не имеет права сломать экран.
 */
import { createLimiter } from "./limiter";
import { createTrail } from "./trail";

export type TelemetryKind = "error" | "freeze" | "blocked_tap" | "dead_taps" | "api_401";

export interface TelemetryContext {
  path: string;
  build: string;
  ua: string;
  standalone: boolean;
}

export interface TelemetryEvent extends TelemetryContext {
  kind: TelemetryKind;
  meta: Record<string, unknown>;
}

export interface TelemetryDeps {
  /** Часы для лимитов (мс). */
  now(): number;
  context(): TelemetryContext;
  /** Отправить пачку; `false` — сейчас нельзя (нет токена), события остаются в очереди. */
  send(events: TelemetryEvent[]): boolean;
}

export interface TelemetryClient {
  /** `message` — то, по чему одинаковые события склеиваются (вместе с видом и экраном). */
  report(kind: TelemetryKind, meta: Record<string, unknown>, message?: string): void;
  crumb(kind: string, value?: string): void;
  flush(): void;
  /** Забрать всё неотправленное (выход из сессии — отложить до следующего входа). */
  drain(): TelemetryEvent[];
  /** Вернуть отложенное в очередь, без повторной проверки лимитов. */
  enqueue(events: TelemetryEvent[]): void;
}

export const QUEUE_MAX = 60;
export const BATCH_MAX = 50;
/** keepalive-запрос браузер принимает до ~64 КБ на все такие запросы сразу — берём с запасом. */
export const BATCH_MAX_BYTES = 48_000;
/** Сервер хранит meta до 2 КБ; на клиенте режем раньше, чтобы не потерять всё целиком. */
export const META_MAX_CHARS = 1800;

/** meta не больше {@link META_MAX_CHARS}: сначала уходят крошки, потом всё, кроме короткого сообщения. */
export function capMeta(meta: Record<string, unknown>): Record<string, unknown> {
  if (JSON.stringify(meta).length <= META_MAX_CHARS) return meta;
  const rest = { ...meta };
  delete rest.trail;
  if (JSON.stringify(rest).length <= META_MAX_CHARS) return { ...rest, trailDropped: true };
  const message = typeof meta.message === "string" ? meta.message.slice(0, 200) : undefined;
  return { truncated: true, ...(message ? { message } : {}) };
}

/** Пачки по ≤ {@link BATCH_MAX} событий и ≤ {@link BATCH_MAX_BYTES} байт JSON. */
export function toBatches(events: TelemetryEvent[]): TelemetryEvent[][] {
  const out: TelemetryEvent[][] = [];
  let cur: TelemetryEvent[] = [];
  let bytes = 0;
  for (const e of events) {
    const size = JSON.stringify(e).length + 1;
    if (cur.length > 0 && (cur.length >= BATCH_MAX || bytes + size > BATCH_MAX_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(e);
    bytes += size;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export function createTelemetryClient(deps: TelemetryDeps): TelemetryClient {
  const limiter = createLimiter({ perMinute: 30, dedupeMs: 60_000 });
  // 401/403 админского API — не чаще раза в минуту, сколько бы запросов ни упало разом.
  const authLimiter = createLimiter({ perMinute: 1, dedupeMs: 60_000 });
  const trail = createTrail();
  let queue: TelemetryEvent[] = [];

  function push(events: TelemetryEvent[]): void {
    queue = queue.concat(events);
    if (queue.length > QUEUE_MAX) queue = queue.slice(queue.length - QUEUE_MAX);
  }

  return {
    report(kind, meta, message = "") {
      try {
        const now = deps.now();
        const ctx = deps.context();
        if (kind === "api_401" && !authLimiter.allow("api_401", now)) return;
        if (!limiter.allow(`${kind}|${message}|${ctx.path}`, now)) return;
        const full = kind === "api_401" ? meta : { ...meta, trail: trail.snapshot(now) };
        push([{ kind, ...ctx, meta: capMeta(full) }]);
      } catch {
        /* телеметрия молчит */
      }
    },
    crumb(kind, value) {
      try {
        trail.push(kind, value, deps.now());
      } catch {
        /* телеметрия молчит */
      }
    },
    flush() {
      if (queue.length === 0) return;
      const batches = toBatches(queue);
      const kept: TelemetryEvent[] = [];
      for (const b of batches) {
        let sent = false;
        try {
          sent = deps.send(b);
        } catch {
          sent = true; // сбой отправки — выбрасываем пачку, а не копим её вечно
        }
        if (!sent) kept.push(...b);
      }
      queue = kept;
    },
    drain() {
      const out = queue;
      queue = [];
      return out;
    },
    enqueue(events) {
      push(events);
    },
  };
}
