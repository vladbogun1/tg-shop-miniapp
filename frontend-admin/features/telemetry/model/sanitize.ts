/**
 * Что из адреса и текста ошибки можно отправить: без id заказов/товаров, без телефонов и почты, без query,
 * кроме `?tab=`. Регулярки без lookbehind (iOS 15.4 не умеет, правило проекта).
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX = /\b[0-9a-f]{24,}\b/gi;
const NUMERIC_SEGMENT = /\/\d{3,}(?=\/|$)/g;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const PHONE = /\+?\d[\d\s()-]{8,}\d/g;
const ORIGIN = /https?:\/\/[^/\s)]+/g;

export const PATH_MAX = 200;

/** `/orders/<uuid>?tab=chat&q=Иван` → `/orders/<id>?tab=chat`. */
export function sanitizePath(pathname: string, search = ""): string {
  let p = (pathname || "/").replace(UUID, "<id>").replace(LONG_HEX, "<id>").replace(NUMERIC_SEGMENT, "/<id>");
  try {
    const tab = new URLSearchParams(search).get("tab");
    if (tab) p += `?tab=${encodeURIComponent(scrubText(tab, 40))}`;
  } catch {
    /* битый query — без вкладки */
  }
  return p.slice(0, PATH_MAX);
}

/** Текст ошибки без id, почты, телефонов и адресов сайта; обрезан до `max`. */
export function scrubText(text: unknown, max = 300): string {
  const s = typeof text === "string" ? text : String(text ?? "");
  return s
    .replace(ORIGIN, "")
    .replace(UUID, "<id>")
    .replace(LONG_HEX, "<id>")
    .replace(EMAIL, "<email>")
    .replace(PHONE, "<num>")
    .slice(0, max);
}

/** id и data-* элемента под пальцем: в них бывают id заказов — без uuid/почты/телефонов, коротко. */
export function scrubAttr(value: string, max = 30): string {
  return scrubText(value, max);
}

/** Имя файла без пути и query: `https://x/_next/static/chunks/app-123.js?v=1` → `app-123.js`. */
export function fileBasename(url: unknown): string {
  if (typeof url !== "string" || !url) return "";
  const noQuery = url.split(/[?#]/)[0] ?? "";
  const parts = noQuery.split("/");
  return (parts[parts.length - 1] || noQuery).slice(0, 80);
}

/** Первые `n` строк стека, без адреса сайта. */
export function stackHead(stack: unknown, n = 5): string[] {
  if (typeof stack !== "string" || !stack) return [];
  return stack
    .split("\n")
    .map((l) => scrubText(l.trim(), 160))
    .filter((l) => l.length > 0)
    .slice(0, n);
}

/**
 * Короткий user agent: без `Mozilla/5.0` и `(KHTML, like Gecko)` — модель, iOS и Safari/версия остаются.
 * `Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1`
 * → `iPhone; CPU iPhone OS 27_0 like Mac OS X AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1`.
 */
export function shortUa(ua: string): string {
  return (ua || "")
    .replace(/^Mozilla\/5\.0\s*/, "")
    .replace(/\(KHTML, like Gecko\)\s*/, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
