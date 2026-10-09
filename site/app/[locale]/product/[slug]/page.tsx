import { BadgeInfo, CreditCard, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { type CatalogSchema, categoryPath, compareGroupOf, imgproxyUrl, MARKDOWN_COLLECTION_SLUG, type ProductCondition, specRows, type StorefrontProduct } from "@shop/shared";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Breadcrumbs, breadcrumbJsonLd, JsonLd, type Crumb } from "@/components/layout/Breadcrumbs";
import { TrackProductView } from "@/components/Analytics";
import { BuyBox } from "@/components/product/BuyBox";
import { AskProductButton } from "@/components/support/AskProductButton";
import { Gallery } from "@/components/product/Gallery";
import { localePath, makeT, type MessageKey } from "@/i18n";
import { toCardProducts } from "@/lib/card";
import { cardContext, loadSchema, yesNo } from "@/lib/catalog";
import { IMAGE_BASE, SITE_URL } from "@/lib/config";
import { stockOf } from "@/lib/stock";
import { localeOf } from "@/lib/route";
import { getProductBySlug, getProductReviews, getProducts, safe } from "@/lib/server-api";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { reviewsLd } from "@/lib/reviews-ld";
import {
  ORG_ID,
  pageMeta,
  productBrandName,
  productDescription,
  productSku,
  productTitle,
  returnPolicyLd,
  shippingLd,
} from "@/lib/seo";

// Literal on purpose: Next reads segment config statically (must match REVALIDATE_SECONDS).
export const revalidate = 60;

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return [];
}

function sortedImages(p: StorefrontProduct) {
  return (p.images ?? [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((i) => i.url)
    .filter((u): u is string => !!u);
}

function absoluteImage(key: string, size: number): string {
  if (/^https?:\/\//i.test(key)) return key;
  return `${SITE_URL}${imgproxyUrl(IMAGE_BASE, key.replace(/^\/+/, ""), size, true)}`;
}

/**
 * Share picture as JPEG: imgproxy renders WebP by default, and a part of link-preview clients
 * (older Viber/LinkedIn, mail) do not take WebP.
 */
function shareImage(key: string): string {
  if (/^https?:\/\//i.test(key)) return key;
  return `${SITE_URL}${imgproxyUrl(IMAGE_BASE, key.replace(/^\/+/, ""), 1200, false).replace(/@webp$/, "@jpg")}`;
}

/**
 * Category path of the product (root → leaf): from the catalog schema by `categoryId`; an older
 * backend without it → the product's tags (catalog v2 sends `tags` = [root, leaf] as well).
 */
function productCategoryPath(p: StorefrontProduct, schema: CatalogSchema): { name: string; slug: string }[] {
  const path = categoryPath(schema, p.categoryId);
  if (path.length) return path.map((c) => ({ name: c.name, slug: c.slug }));
  return (p.tags ?? [])
    .filter((tag) => tag.slug !== MARKDOWN_COLLECTION_SLUG)
    .slice(0, 2)
    .map((tag) => ({ name: tag.name, slug: tag.slug ?? tag.id }));
}

/** NEW / MARKDOWN / USED; an older backend marks markdown with the «utsenka» tag. */
function productCondition(p: StorefrontProduct): ProductCondition {
  if (p.condition) return p.condition;
  return (p.tags ?? []).some((tag) => tag.slug === MARKDOWN_COLLECTION_SLUG) ? "MARKDOWN" : "NEW";
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  const { slug } = await params;
  const t = makeT(locale);
  const [product, schema] = await Promise.all([safe(getProductBySlug(decodeURIComponent(slug), locale), null), loadSchema(locale)]);
  if (!product) return { title: t("notFound.title"), robots: { index: false } };
  const images = sortedImages(product);
  return pageMeta({
    locale,
    path: `/product/${product.slug}`,
    title: productTitle(product, locale, productCategoryPath(product, schema).at(-1)),
    description: productDescription(product, locale),
    image: images[0] ? { url: shareImage(images[0]), width: 1200, height: 1200, alt: product.title } : null,
  });
}

const PROMISES: { icon: typeof Truck; title: MessageKey; text: MessageKey; href?: string }[] = [
  { icon: Truck, title: "product.promise.delivery.title", text: "product.promise.delivery.text", href: "/delivery" },
  { icon: CreditCard, title: "product.promise.payment.title", text: "product.promise.payment.text", href: "/delivery" },
  { icon: RotateCcw, title: "product.promise.returns.title", text: "product.promise.returns.text", href: "/returns" },
  { icon: ShieldCheck, title: "product.promise.warranty.title", text: "product.promise.warranty.text", href: "/warranty" },
];

export default async function ProductPage({ params }: { params: Params }) {
  const locale = await localeOf(params);
  const { slug } = await params;
  const t = makeT(locale);
  const [product, schema] = await Promise.all([safe(getProductBySlug(decodeURIComponent(slug), locale), null), loadSchema(locale)]);
  if (!product) notFound();
  // One address per product: /product/ATTACK-Shark → /product/attack-shark (the API matches slugs
  // case-insensitively, so the odd spelling would otherwise be a 200 duplicate).
  if (decodeURIComponent(slug) !== product.slug) permanentRedirect(localePath(locale, `/product/${product.slug}`));

  const catPath = productCategoryPath(product, schema);
  const category = catPath.at(-1) ?? null;
  const related = category
    ? await safe(getProducts({ category: category.slug, inStock: true, size: 9 }, locale), null)
    : null;
  const relatedItems = (related?.items ?? []).filter((p) => p.id !== product.id).slice(0, 8);
  const reviewPage = await safe(getProductReviews(product.slug, locale), null);

  const crumbs: Crumb[] = [
    { label: t("catalog.title"), path: "/catalog" },
    ...catPath.map((c) => ({ label: c.name, path: `/catalog/${c.slug}` })),
    { label: product.title },
  ];
  const path = `/product/${product.slug}`;
  const images = sortedImages(product);
  const inStock = stockOf(product, null) > 0;

  const brand = productBrandName(product);
  const condition = productCondition(product);
  const markdown = condition !== "NEW";
  const specs = specRows(schema, product.categoryId, product.specs, locale, yesNo(locale));
  const additionalProperty = specs.flatMap(({ rows }) =>
    rows.map(({ attr, text }) => {
      const raw = product.specs?.[attr.key];
      // Plain numbers go as value + unitText; everything else as the formatted text.
      return typeof raw === "number"
        ? { "@type": "PropertyValue", name: attr.label, value: raw, ...(attr.unit ? { unitText: attr.unit } : {}) }
        : { "@type": "PropertyValue", name: attr.label, value: text };
    })
  );
  const productUrl = `${SITE_URL}${localePath(locale, path)}`;
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.title,
    url: productUrl,
    sku: productSku(product),
    description: productDescription(product, locale),
    image: images.slice(0, 6).map((k) => absoluteImage(k, 1200)),
    ...(catPath.length ? { category: catPath.map((c) => c.name).join(" > ") } : {}),
    ...(additionalProperty.length ? { additionalProperty } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: product.currency ?? "UAH",
      price: (product.priceMinor / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      // As in the Google feed: markdown/used goods are sold with stated defects, not refurbished.
      itemCondition: markdown ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
      shippingDetails: shippingLd(),
      hasMerchantReturnPolicy: returnPolicyLd(markdown),
      seller: { "@type": "OnlineStore", "@id": ORG_ID, name: "ChiSetup", url: SITE_URL },
    },
    ...reviewsLd(product, reviewPage, t("reviews.customer")),
  };

  return (
    <div className="container-site pt-6">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbJsonLd(locale, SITE_URL, crumbs, path)} />
      <Breadcrumbs locale={locale} items={crumbs} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <Gallery images={images} alt={product.title} />
        <div className="min-w-0">
          <BuyBox product={product} compareGroup={compareGroupOf(schema, product.categoryId)} />
          {(product.brandRef || markdown) && (
            <div className="mt-4 flex flex-col gap-3">
              {product.brandRef && (
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--muted)]">
                  <span className="eyebrow text-[11px]">{t("product.brand")}</span>
                  <a
                    href={localePath(locale, `/catalog?brand=${encodeURIComponent(product.brandRef.slug)}`)}
                    title={t("product.brandAll", { brand: product.brandRef.name })}
                    className="font-display text-[15px] font-bold text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--accent-hi)] hover:decoration-[var(--accent)]"
                  >
                    {product.brandRef.name}
                  </a>
                </p>
              )}
              {markdown && (
                <div className="flex gap-3 rounded-[var(--r-card)] border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3.5">
                  <BadgeInfo className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" strokeWidth={2} />
                  <div className="min-w-0">
                    <p className="font-display text-[13px] font-bold uppercase tracking-[.08em] text-[var(--warn)]">
                      {t(condition === "USED" ? "product.cond.USED" : "product.cond.MARKDOWN")}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-[14px] font-medium leading-snug text-[var(--ink)]">
                      {product.conditionNote?.trim() || t(condition === "USED" ? "product.cond.USED.text" : "product.cond.MARKDOWN.text")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <AskProductButton productId={product.id} productTitle={product.title} />
          <TrackProductView productId={product.id} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROMISES.map(({ icon: Icon, title, text, href }) => (
              <li key={title} className="nb-flat flex gap-3 p-3.5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2} />
                <div className="min-w-0">
                  {href ? (
                    <a href={localePath(locale, href)} className="font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]">
                      {t(title)}
                    </a>
                  ) : (
                    <p className="text-[13px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t(title)}</p>
                  )}
                  <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--muted)]">{t(text)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-12 max-w-3xl" aria-labelledby="pd-desc">
        <h2 id="pd-desc" className="mb-4 flex items-center gap-3 font-display text-[22px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
          <span aria-hidden className="tech-mark" />
          {t("product.description")}
        </h2>
        <div className="nb p-5 sm:p-7">
          {product.description ? (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#D4D4D8]">
              {product.description}
            </p>
          ) : (
            <p className="text-[15px] font-medium text-[var(--muted)]">{t("product.noDescription")}</p>
          )}
        </div>
      </section>

      {specs.length > 0 && (
        <section className="mt-12 max-w-3xl" aria-labelledby="pd-specs">
          <h2 id="pd-specs" className="mb-4 flex items-center gap-3 font-display text-[22px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
            <span aria-hidden className="tech-mark" />
            {t("product.specs")}
          </h2>
          <div className="nb overflow-hidden">
            {specs.map(({ group, rows }) => (
              <table key={group.key} className="w-full border-collapse text-[14px]">
                {specs.length > 1 && (
                  <caption className="eyebrow border-b border-[var(--line)] bg-[var(--surface-2)] px-5 py-2.5 text-left text-[11px] sm:px-7">{group.label}</caption>
                )}
                <tbody>
                  {rows.map(({ attr, text }) => (
                    <tr key={attr.key} className="border-b border-[var(--line)]">
                      <th scope="row" className="w-[45%] px-5 py-2.5 text-left align-top font-medium text-[var(--muted)] sm:px-7">
                        {attr.label}
                      </th>
                      <td className="px-5 py-2.5 align-top font-semibold text-[var(--ink)] [overflow-wrap:anywhere] sm:px-7">{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      )}

      <ProductReviews slug={product.slug} initial={reviewPage} />

      {relatedItems.length > 0 && (
        <section className="mt-14" aria-labelledby="pd-related">
          <h2 id="pd-related" className="mb-5 flex items-center gap-3 font-display text-[22px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[28px]">
            <span aria-hidden className="tech-mark" />
            {t("product.related")}
          </h2>
          <ProductGrid products={toCardProducts(relatedItems.slice(0, 4), cardContext(schema, locale))} />
        </section>
      )}
    </div>
  );
}
