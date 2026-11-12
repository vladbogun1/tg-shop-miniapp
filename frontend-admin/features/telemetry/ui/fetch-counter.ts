/**
 * Счётчик начатых запросов для «злых тапов»: был ли после тапа хоть один запрос в сеть. Оборачивает
 * `window.fetch` только чтобы посчитать вызов — аргументы, результат и ошибки проходят как есть. Запросы самой
 * телеметрии не считаются. Снимается при выходе из оболочки (и не трогает fetch, если его уже подменил кто-то ещё).
 */
export function installFetchCounter(onStart: () => void, ignorePath: string): () => void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return () => undefined;
  const original = window.fetch;
  const counted: typeof window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes(ignorePath)) onStart();
    } catch {
      /* счётчик не мешает запросу */
    }
    return original.call(window, input, init);
  };
  window.fetch = counted;
  return () => {
    if (window.fetch === counted) window.fetch = original;
  };
}
