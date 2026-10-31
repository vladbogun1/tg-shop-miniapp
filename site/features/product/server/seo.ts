import "server-only";
import { guessProductBrand } from "@shop/core/product-brand";
import { type Locale } from "@shop/core/i18n";
import { type StorefrontProduct } from "@shop/core/site";
import { makeT } from "@/i18n";
import { clip, metaPrice } from "@/features/seo/server";
import { categoryWords } from "@/features/catalog/server";

/** `<title>` of a product without an admin seoTitle: "{title} — ігрова мишка, купити в Україні". */
export function productTitle(p: StorefrontProduct, locale: Locale, leaf?: { slug: string; name: string } | null): string {
  if (p.seoTitle) return p.seoTitle;
  const t = makeT(locale);
  // The leaf category: given by the caller (schema path), else the last of `tags` (= root, leaf).
  const tag = leaf ?? p.tags?.[p.tags.length - 1];
  const item = tag ? categoryWords(tag.slug, tag.name, locale).item : undefined;
  // Skip the type when the name already says it ("Килимок Attack Shark", "Cable, White").
  const lower = p.title.toLocaleLowerCase();
  const said = !!item && item.split(/\s+/).some((w) => w.length >= 5 && lower.includes(w.slice(0, 5).toLocaleLowerCase()));
  return item && !said ? `${p.title} — ${item}, ${t("meta.buy")}` : `${p.title} — ${t("meta.buy")}`;
}

/** Meta description: admin seoDescription, else the start of the description + price and delivery. */
export function productDescription(p: StorefrontProduct, locale: Locale): string {
  if (p.seoDescription) return p.seoDescription;
  const t = makeT(locale);
  const tail = t("meta.productDescription", { price: metaPrice(p.priceMinor, locale) });
  const text = (p.description ?? "").replace(/[•\s]+/g, " ").trim();
  const room = 200 - tail.length - 1;
  return text ? `${clip(text, room).replace(/[.!…]?$/, (m) => m || ".")} ${tail}` : `${p.title}. ${tail}`;
}

/**
 * The product's brand guessed from its texts, or null when we do not know it (then schema.org gets
 * no `brand` at all — better than a wrong one): a "Бренд: …" line in the description, then a known
 * brand name in the title (`guessProductBrand` in @shop/shared, also used by the admin's hint).
 * Fallback for {@link productBrandName}: the admin's `brand` field wins when filled in.
 */
export function productBrand(p: Pick<StorefrontProduct, "title" | "description">): string | null {
  return guessProductBrand(p);
}

/**
 * Brand for schema.org and feeds: the brand directory (`brandRef`, catalog v2), else the admin's old
 * text field, else the {@link productBrand} heuristic.
 */
export function productBrandName(p: Pick<StorefrontProduct, "title" | "description" | "brand" | "brandRef">): string | null {
  return p.brandRef?.name?.trim() || p.brand?.trim() || productBrand(p);
}

/** schema.org `sku`: the admin's article number, else the product id. */
export function productSku(p: Pick<StorefrontProduct, "id" | "sku">): string {
  return p.sku?.trim() || p.id;
}

