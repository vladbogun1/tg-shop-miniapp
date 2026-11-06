/** «Фото по ссылке»: одна ссылка, которую нужно скачать для товара, и порядок очереди. Чистая логика. */

export interface PhotoJob {
  productId: string;
  title: string;
  url: string;
}

/** Jobs of one product run one after another (keeps their order); different products run side by side. */
export function groupByProduct(jobs: PhotoJob[]): PhotoJob[][] {
  const by = new Map<string, PhotoJob[]>();
  for (const j of jobs) by.set(j.productId, [...(by.get(j.productId) ?? []), j]);
  return Array.from(by.values());
}

/**
 * Worth one quiet repeat: the browser lost the connection (status 0 — «Не удалось связаться с сервером») or the server
 * was briefly unavailable (5xx). A site that answered «нет такого файла» (4xx) will say the same again. A repeat is safe:
 * the server does not add the same link to the same product twice.
 */
export function isTransientError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status === 0 || status >= 500);
}
