/**
 * Ошибки API (docs/ARCHITECTURE-FRONT.md, 2.5 «Ошибки»).
 *
 * `ApiError{status, code, params}`: `code` — стабильный код причины с бэкенда (`DomainException`/`ErrorCode`,
 * например "PROMO_REJECTED"), по нему ветвятся приложения; `params` — подстановки в текст ошибки.
 * Текст человеку даёт {@link errorMessage}: покупателю — по коду через словарь `error.<CODE>`, админу —
 * русский текст сервера.
 */

import type { ServerErrorCode } from "./api/error-codes";

/**
 * Код причины с бэкенда (`ErrorCode.code()`): union из `api/error-codes.d.ts`, который генерируется из enum'ов
 * `<Модуль>Error` (`npm run gen:api`). Опечатка в `e.code === "…"` или `hasErrorCode(e, "…")` — ошибка typecheck.
 */
export type ErrorCode = ServerErrorCode;

export type ErrorParams = Record<string, string | number>;

export class ApiError extends Error {
  readonly status: number;
  /**
   * Стабильный код причины, если сервер его прислал. Ветвиться по нему, а не по тексту сообщения: тексты
   * можно переформулировать, не ломая приложения.
   */
  readonly code?: ErrorCode;
  /** Подстановки для текста `error.<code>`, если сервер их прислал. */
  readonly params?: ErrorParams;

  constructor(message: string, status: number, code?: ErrorCode | (string & {}), params?: ErrorParams) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code as ErrorCode | undefined;
    this.params = params;
  }
}

/** Функция перевода приложения: `t("error.PROMO_REJECTED", params)`. Возвращает ключ, если перевода нет. */
export type Translate = (key: string, params?: ErrorParams) => string;

/**
 * Текст ошибки для показа. `ApiError` с кодом и переводом `error.<code>` в словаре — перевод; иначе текст
 * сервера; всё остальное (сбой сети, исключение кода) — `fallback`: сырое `e.message` людям не показывают.
 */
export function errorMessage(e: unknown, t?: Translate, fallback = ""): string {
  if (!(e instanceof ApiError)) return fallback;
  if (t && e.code) {
    const key = `error.${e.code}`;
    const text = t(key, e.params);
    if (text && text !== key) return text;
  }
  return e.message || fallback;
}

/** `e` — `ApiError` с этим кодом (одним из этих кодов). */
export function hasErrorCode(e: unknown, ...codes: ErrorCode[]): boolean {
  return e instanceof ApiError && e.code !== undefined && codes.includes(e.code);
}
