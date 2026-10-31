/**
 * Витринный товар — ответ `GET /api/products`, `/api/public/products`, `/api/products/{id}`.
 * Типы только из OpenAPI (`packages/core/src/api/generated.d.ts`): ручного `interface Product` здесь нет.
 *
 * Сгенерированный `ProductDto` честный: у каждого поля есть значение, «нет» = `null`. Старый ручной тип считал всё
 * необязательным (`?:`) и не знал про `null`, из-за чего в коде рядом жили `p.x ?? 0` и `p.x ?? undefined`.
 * View-модели (то, что нужно плитке/корзине) — в соседних файлах `model/`, а не вторая копия DTO.
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { ProductSpecs } from "@shop/core/catalog";

export type Product = Schemas["ProductDto"];
export type ProductVariant = Schemas["ProductVariantDto"];
export type ProductImage = Schemas["ProductImageDto"];
export type ProductTag = Schemas["TagDto"];

/**
 * Характеристики товара. В OpenAPI это `{[key]: unknown}` (JSON-колонка бэкенда, значения — число, диапазон, строка,
 * список или bool по типу атрибута). Сужение до `ProductSpecs` — единственное место, где мы доверяем бэкенду,
 * что значение соответствует схеме атрибута (её валидирует бэкенд при сохранении).
 */
export function specsOf(p: { specs?: Record<string, unknown> | null }): ProductSpecs {
  return (p.specs ?? {}) as ProductSpecs;
}
