import type { ProductSpecs } from "@shop/core/catalog";
import type { CardMeta } from "@/features/catalog";
import type { AdminProductDto, AdminProductSaved } from "./types";

/**
 * Ответ API → вид экрана: `null` в местах, где экран и витринный `Product` ждут «нет» (`undefined`).
 * Остальные поля (включая те, о которых экран не знает) идут как пришли; `specIssues` бывает непустым только в
 * ответе на запись.
 */
export function fromAdminProductDto(d: AdminProductDto): AdminProductSaved {
  return {
    ...d,
    description: d.description ?? undefined,
    images: d.images?.map((i) => ({ id: i.id ?? undefined, url: i.url ?? undefined, sortOrder: i.sortOrder })),
    variants: d.variants?.map((v) => ({ id: v.id ?? undefined, name: v.name, stock: v.stock, sortOrder: v.sortOrder })),
    tags: d.tags ?? undefined,
    condition: d.condition ?? undefined,
    specs: d.specs as ProductSpecs,
    cardMeta: d.cardMeta as CardMeta,
  };
}
