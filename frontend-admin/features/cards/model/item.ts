/** «Карточки»: товар в виде выгрузки `GET /api/admin/cards/export`, id товаров в ответе ИИ и мелкие помощники. Чистый модуль. */
export type CardCondition = "NEW" | "MARKDOWN" | "USED";
export type CardStatusCode = "DRAFT" | "AI_FILLED" | "READY";

/** One product as `GET /api/admin/cards/export` returns it (fields we read; extra ones are kept). */
export interface CardItem {
  id: string;
  title: string;
  slug?: string | null;
  categoryId?: string | null;
  categorySlug?: string | null;
  brand?: string | null;
  condition?: CardCondition | string | null;
  conditionNote?: string | null;
  description?: string | null;
  specs?: Record<string, unknown> | null;
  cardStatus?: CardStatusCode | string | null;
  cardConfidence?: number | null;
  cardMeta?: Record<string, unknown> | null;
  missingRequired?: string[] | null;
  variants?: (string | { name?: string | null })[] | null;
  imageUrl?: string | null;
  priceMinor?: number | null;
  /** Older name of priceMinor in the contract draft. */
  price?: number | null;
  active?: boolean | null;
  stock?: number | null;
  /** V53: created via the short admin form and not yet published/archived («Незавершённые»). */
  unfinished?: boolean | null;
}

function lcp(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Product UUID → answer id: "p" + the shortest hex prefix (min 8) unique among the given ids.
 * Pass ALL products the screen knows (not one batch), so the ids do not depend on the selection.
 */
export function assignCardIds(productIds: string[]): Map<string, string> {
  const hexOf = new Map<string, string>();
  for (const id of productIds) hexOf.set(id, id.replace(/-/g, "").toLowerCase());
  const sorted = Array.from(new Set(hexOf.values())).sort();
  const len = new Map<string, number>();
  sorted.forEach((h, i) => {
    let n = 8;
    if (i > 0) n = Math.max(n, lcp(sorted[i - 1], h) + 1);
    if (i < sorted.length - 1) n = Math.max(n, lcp(sorted[i + 1], h) + 1);
    len.set(h, Math.min(n, h.length));
  });
  const out = new Map<string, string>();
  hexOf.forEach((h, id) => out.set(id, "p" + h.slice(0, len.get(h))));
  return out;
}

export function variantNames(item: CardItem): string[] {
  return (item.variants ?? [])
    .map((v) => (typeof v === "string" ? v : v?.name ?? ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function priceUah(item: CardItem): number | null {
  const minor = item.priceMinor ?? item.price;
  return typeof minor === "number" ? Math.round(minor) / 100 : null;
}

/** Batches keep the given order — sort by category first, so a batch needs fewer schema sections. */
export function splitIntoBatches<T>(items: T[], maxPerBatch = 8): T[][] {
  const size = Math.max(1, Math.floor(maxPerBatch));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
