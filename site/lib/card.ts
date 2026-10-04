/**
 * What a catalog tile actually needs from a product.
 *
 * `ProductGrid` is a client component, so every prop is serialized into the page's RSC payload. The
 * full StorefrontProduct dragged the whole description, every photo and the tags of each card
 * into the HTML (~128 KB of the home page). The tile shows the first photo, title, prices and
 * stock, and the cart keeps the same fields — nothing else is read on the client.
 */
import type { StorefrontProduct } from "@shop/shared";

export function toCardProduct(p: StorefrontProduct): StorefrontProduct {
  const first = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    priceMinor: p.priceMinor,
    currency: p.currency,
    compareAtMinor: p.compareAtMinor,
    stock: p.stock,
    images: first ? [{ url: first.url, sortOrder: first.sortOrder }] : [],
    variants: (p.variants ?? []).map((v) => ({ id: v.id, name: v.name, stock: v.stock, sortOrder: v.sortOrder })),
  };
}

export function toCardProducts(items: StorefrontProduct[]): StorefrontProduct[] {
  return items.map(toCardProduct);
}
