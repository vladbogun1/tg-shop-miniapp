/**
 * Server-side data access for server components (SSR/ISR).
 *
 * Talks to the backend directly over the internal network (`INTERNAL_API_BASE`, e.g.
 * `http://backend:8080` in docker) with Next's data cache: every response is cached for
 * {@link REVALIDATE_SECONDS} and tagged, so `/_site/revalidate` can drop it early after an admin edit.
 *
 * Catalog content is translated per language (docs/CONTENT-I18N.md), so every catalog call carries
 * the page's locale twice: `Accept-Language` (what the backend normally reads) AND `?lang=` — Next's
 * fetch cache keys on the URL, not on headers, so without the query parameter a cached Russian
 * response could be served to the Ukrainian page of the same path.
 */
import "server-only";
import type { Locale } from "@shop/core/i18n";
import { fetchWithTimeout } from "@shop/core/fetch-timeout";
import { REVALIDATE_SECONDS } from "./config";

/**
 * Зависший бэкенд не должен держать страницу: SSR/ISR ждёт ответ не дольше 8 с. Дальше сработает
 * `safe()` с запасным значением, либо страница ошибки; ISR отдаст прежний кэш и перестроит позже.
 * (У браузерного клиента 15 с — человек ждёт дольше, чем сервер, который держит соединение.)
 */
export const SSR_TIMEOUT_MS = 8_000;

export function apiBase(): string {
  return (process.env.INTERNAL_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
}

export class NotFoundError extends Error {}

/** Appends `lang=<locale>` to a backend path (which may already have a query string). */
function withLang(path: string, locale: Locale): string {
  return `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;
}


export async function getJson<T>(
  path: string,
  locale: Locale | null,
  tags: string[] = ["catalog"],
  revalidate: number = REVALIDATE_SECONDS
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (locale) headers["Accept-Language"] = locale;
  const { res, done } = await fetchWithTimeout(
    `${apiBase()}${locale ? withLang(path, locale) : path}`,
    { headers, next: { revalidate, tags } },
    SSR_TIMEOUT_MS
  );
  try {
    if (res.status === 404) throw new NotFoundError(path);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    done();
  }
}

/** Same as the promise-returning getters, but resolves to a fallback instead of throwing. */
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[site] data fetch failed:", e);
    return fallback;
  }
}
