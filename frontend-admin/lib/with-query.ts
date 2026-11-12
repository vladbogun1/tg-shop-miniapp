/** Параметры страницы Next (`searchParams`): у ключа одно значение, несколько или ничего. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/** Адрес с теми же параметрами запроса — для страниц-редиректов со старых адресов. */
export function withQuery(path: string, params: PageSearchParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, one);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
