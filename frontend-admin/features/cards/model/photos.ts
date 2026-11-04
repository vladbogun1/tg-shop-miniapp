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
