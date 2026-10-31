/** Выбор позиции для добавления в заказ. Без React. */
import type { Product, ProductVariant } from "@/lib/api";

export function filterPickable(products: Product[], q: string): Product[] {
  const s = q.trim().toLowerCase();
  return products
    .filter((p) => !p.archived)
    .filter((p) => (s ? p.title.toLowerCase().includes(s) : true))
    .slice(0, 40);
}

/** Сколько на складе: сумма по вариантам или остаток товара. */
export function effectiveStock(p: Product): number {
  return p.variants?.length ? p.variants.reduce((s, v) => s + (v.stock ?? 0), 0) : p.stock ?? 0;
}

export function availableStock(selected: Product | null, variant: ProductVariant | null): number {
  const hasVariants = !!selected?.variants && selected.variants.length > 0;
  return hasVariants ? variant?.stock ?? 0 : selected?.stock ?? 0;
}

/** Можно ли добавить: выбран товар (и вариант, если они есть), количество от 1 до остатка. */
export function canAddItem(selected: Product | null, variant: ProductVariant | null, qty: number): boolean {
  if (!selected) return false;
  const needsVariant = !!selected.variants && selected.variants.length > 0;
  return (!needsVariant || !!variant) && qty >= 1 && qty <= availableStock(selected, variant);
}
