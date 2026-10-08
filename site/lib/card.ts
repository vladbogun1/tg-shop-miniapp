/**
 * What a catalog tile actually needs from a product.
 *
 * `ProductGrid` is a client component, so every prop is serialized into the page's RSC payload. The
 * full StorefrontProduct dragged the whole description, every photo and the tags of each card
 * into the HTML (~128 KB of the home page). The tile shows the first photo, title, prices and
 * stock, the spec line and the condition badge, and the cart keeps the same fields — nothing else is read on the client.
 */
import type { CatalogSchema, Locale, StorefrontProduct } from "@shop/shared";
import { specSummary } from "@shop/shared";

/** A catalog tile's data: the product fields below + the spec line computed on the server. */
export interface CardProduct extends StorefrontProduct {
  /** "51 г · PAW3950 · 8000 Гц" (highlight attributes); absent when nothing is known. */
  specLine?: string;
}

/** Spec summary context; without it the tiles simply have no spec line. */
export interface CardContext {
  schema: CatalogSchema | null;
  locale: Locale;
  yesNo: [string, string];
}

export function toCardProduct(p: StorefrontProduct, ctx?: CardContext): CardProduct {
  const specLine = ctx?.schema && p.categoryId && p.specs ? specSummary(ctx.schema, p.categoryId, p.specs, ctx.locale, ctx.yesNo) : "";
  const first = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    priceMinor: p.priceMinor,
    currency: p.currency,
    compareAtMinor: p.compareAtMinor,
    stock: p.stock,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    condition: p.condition,
    ...(specLine ? { specLine } : {}),
    images: first ? [{ url: first.url, sortOrder: first.sortOrder }] : [],
    variants: (p.variants ?? []).map((v) => ({ id: v.id, name: v.name, stock: v.stock, sortOrder: v.sortOrder })),
  };
}

export function toCardProducts(items: StorefrontProduct[], ctx?: CardContext): CardProduct[] {
  return items.map((p) => toCardProduct(p, ctx));
}
