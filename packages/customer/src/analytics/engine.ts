/**
 * Журнал событий покупателя: один движок для Mini App и сайта. Отличается только политика
 * (`AnalyticsPolicy`): куда слать, чем подписывать, сколько хранить.
 *
 * Гарантии (общие для обоих приложений):
 *   - ничего здесь не ломает экран: каждый путь обёрнут, сбои глотаются;
 *   - буфер переживает перезагрузку (localStorage), но ограничен;
 *   - отправка пачками, а при скрытии/закрытии вкладки — сразу (`keepalive`);
 *   - пишем что нажали и где, никогда — что набрали: значения полей в буфер не попадают.
 *
 * Имена событий, поля и форма тела запроса — контракт с бэкендом (StructuredEvents); менять их
 * нельзя, не поменяв бэкенд.
 */
import { describeError, reportable } from "@shop/core/client-error";
import { localStore, sessionStore, type SafeStorage } from "@shop/core/storage";
import { now } from "@shop/core/time";
import { describeTap } from "@shop/ui/tap";

export interface ClientEvent {
  event: string;
  target?: string;
  path?: string;
  meta?: string;
  clientTime: string;
}

export interface AnalyticsPolicy {
  /** Ключи localStorage/sessionStorage: у приложений свои, чтобы буферы не смешивались. */
  keys: { buffer: string; session: string; anon?: string };
  /** Потолок буфера = потолок пачки на бэкенде для этого канала; сверх него старые события отбрасываются. */
  maxBuffered: number;
  /** Куда и с чем отправлять; `null` — пока некому приписать события (Mini App без токена). */
  request: () => { url: string; headers: Record<string, string>; credentials?: RequestCredentials } | null;
  /** Новый идентификатор, если `crypto.randomUUID` нет (старые WebView). */
  fallbackId: () => string;
  /** Что вернуть, если хранилище недоступно совсем. */
  unavailableId: string;
  /** Сведения о клиенте для строки ошибки (Mini App: платформа и версия Telegram). */
  errorRuntime?: () => Record<string, unknown>;
}

export interface Analytics {
  track: (event: string, target?: string, meta?: string) => void;
  flush: (keepalive?: boolean) => Promise<void>;
  start: () => () => void;
}

const FLUSH_INTERVAL_MS = 15_000;

function storedId(storage: SafeStorage, key: string, policy: AnalyticsPolicy): string {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : policy.fallbackId();
    storage.setItem(key, fresh);
    return fresh;
  } catch {
    return policy.unavailableId;
  }
}

export function createAnalytics(policy: AnalyticsPolicy): Analytics {
  let buffer: ClientEvent[] = [];
  let started = false;
  let flushing = false;

  const persist = () => {
    try {
      localStore.setItem(policy.keys.buffer, JSON.stringify(buffer));
    } catch {
      /* приватный режим / квота — буфер в памяти всё равно работает */
    }
  };

  const restore = () => {
    try {
      const raw = localStore.getItem(policy.keys.buffer);
      if (raw) buffer = (JSON.parse(raw) as ClientEvent[]).slice(-policy.maxBuffered);
    } catch {
      buffer = [];
    }
  };

  /** Записывает одно событие. Дёшево и синхронно: только добавляет в локальный буфер. */
  const track = (event: string, target?: string, meta?: string) => {
    try {
      buffer.push({
        event,
        target,
        path: typeof location === "undefined" ? undefined : location.pathname,
        meta,
        clientTime: now().toISOString(),
      });
      if (buffer.length > policy.maxBuffered) buffer = buffer.slice(-policy.maxBuffered);
      persist();
    } catch {
      /* инструментация не должна ломать экран */
    }
  };

  /** Отправляет буфер. 4xx — сервер эту пачку не примет никогда, её отбрасываем; 5xx и сеть — события возвращаются. */
  const flush = async (keepalive = false): Promise<void> => {
    if (flushing || buffer.length === 0) return;
    const req = policy.request();
    if (!req) return;
    const batch = buffer;
    buffer = [];
    persist();
    flushing = true;
    try {
      const anon = policy.keys.anon ? { anonId: storedId(localStore, policy.keys.anon, policy) } : {};
      const res = await fetch(req.url, {
        method: "POST",
        keepalive,
        ...(req.credentials ? { credentials: req.credentials } : {}),
        headers: { "Content-Type": "application/json", ...req.headers },
        body: JSON.stringify({ ...anon, sessionId: storedId(sessionStore, policy.keys.session, policy), events: batch }),
      });
      if (!res.ok && res.status >= 500) throw new Error(String(res.status));
    } catch {
      buffer = [...batch, ...buffer].slice(-policy.maxBuffered);
      persist();
    } finally {
      flushing = false;
    }
  };

  /** Ставит слушатели один раз. Безопасно вызывать из каждого монтирования. */
  const start = (): (() => void) => {
    if (started || typeof window === "undefined") return () => {};
    started = true;
    restore();

    const onClick = (e: MouseEvent) => {
      try {
        const tap = describeTap(e);
        if (tap) track("click", tap.label, tap.meta);
      } catch {
        /* инструментация не должна ломать экран */
      }
    };
    const onFailure = (e: ErrorEvent | PromiseRejectionEvent) => {
      try {
        const err = describeError(e, policy.errorRuntime?.());
        if (!reportable(err)) return;
        track("error", err.message, err.meta);
      } catch {
        /* инструментация не должна ломать экран */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onPageHide = () => void flush(true);

    document.addEventListener("click", onClick, { capture: true, passive: true });
    window.addEventListener("error", onFailure);
    window.addEventListener("unhandledrejection", onFailure);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("error", onFailure);
      window.removeEventListener("unhandledrejection", onFailure);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      started = false;
    };
  };

  return { track, flush, start };
}
