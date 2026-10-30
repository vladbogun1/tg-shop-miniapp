/**
 * Безопасный доступ к localStorage/sessionStorage (docs/ARCHITECTURE-FRONT.md, 2.5 «Клиентское состояние»).
 *
 * Единственное место, где разрешены `localStorage`/`sessionStorage`. Хранилища бывают недоступны (приватный
 * режим, заблокированные данные сайта, SSR, квота), поэтому каждый вызов в try/catch: чтение — `null`,
 * запись — `false`. Ключи у каждого приложения свои по соглашению (`compare-v1`, `site-cart-v1`); префикс —
 * для новых ключей. Методы `getItem/setItem/removeItem` совместимы с `StateStorage` zustand.
 */

export interface SafeStorage {
  getItem(key: string): string | null;
  /** `false` — запись не удалась (квота, приватный режим); приложение продолжает работать без неё. */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  /** JSON по ключу; `null`, если ключа нет, значение не JSON или хранилище недоступно. */
  getJson<T>(key: string): T | null;
  setJson(key: string, value: unknown): boolean;
}

export type StorageKind = "local" | "session";

function area(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // SSR или доступ запрещён
  }
}

export function createStorage(kind: StorageKind, prefix = ""): SafeStorage {
  const k = (key: string) => prefix + key;
  const self: SafeStorage = {
    getItem(key) {
      try {
        return area(kind)?.getItem(k(key)) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        const s = area(kind);
        if (!s) return false;
        s.setItem(k(key), value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem(key) {
      try {
        area(kind)?.removeItem(k(key));
      } catch {
        /* нечего удалять */
      }
    },
    getJson<T>(key: string) {
      const raw = self.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson(key, value) {
      try {
        return self.setItem(key, JSON.stringify(value));
      } catch {
        return false;
      }
    },
  };
  return self;
}

/** localStorage: переживает перезапуск. */
export const localStore = createStorage("local");
/** sessionStorage: до закрытия вкладки. */
export const sessionStore = createStorage("session");

/** Адаптер под `createJSONStorage` у zustand (`StateStorage`: `setItem` ничего не возвращает). */
export function asStateStorage(s: SafeStorage): Pick<SafeStorage, "getItem" | "removeItem"> & { setItem(key: string, value: string): void } {
  return {
    getItem: (key) => s.getItem(key),
    setItem: (key, value) => void s.setItem(key, value),
    removeItem: (key) => s.removeItem(key),
  };
}
