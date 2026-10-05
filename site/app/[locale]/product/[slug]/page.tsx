import { CreditCard, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { imgproxyUrl, type StorefrontProduct } from "@shop/shared";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Breadcrumbs, breadcrumbJsonLd, JsonLd, type Crumb } from "@/components/layout/Breadcrumbs";
import { TrackProductView } from "@/components/Analytics";
import { BuyBox } from "@/components/product/BuyBox";
import { Gallery } from "@/components/product/Gallery";
import { localePath, makeT, type MessageKey } from "@/i18n";
import { toCardProducts } from "@/lib/card";
import { IMAGE_BASE, SITE_URL } from "@/lib/config";
import { stockOf } from "@/lib/stock";
import { localeOf } from "@/lib/route";
import { getProductBySlug, getProducts, safe } from "@/lib/server-api";
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

function primaryCategory(p: StorefrontProduct) {
  const tag = p.tags?.[0];
  return tag ? { name: tag.name, slug: tag.slug ?? tag.id } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  const { slug } = await params;
  const t = makeT(locale);
  const product = await safe(getProductBySlug(decodeURIComponent(slug), locale), null);
  if (!product) return { title: t("notFound.title"), robots: { index: false } };
  const images = sortedImages(product);
  return pageMeta({
    locale,
    path: `/product/${product.slug}`,
    title: productTitle(product, locale),
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
  const product = await safe(getProductBySlug(decodeURIComponent(slug), locale), null);
  if (!product) notFound();
  // One address per product: /product/ATTACK-Shark → /product/attack-shark (the API matches slugs
  // case-insensitively, so the odd spelling would otherwise be a 200 duplicate).
  if (decodeURIComponent(slug) !== product.slug) permanentRedirect(localePath(locale, `/product/${product.slug}`));

  const category = primaryCategory(product);
  const related = category
    ? await safe(getProducts({ category: category.slug, inStock: true, size: 9 }, locale), null)
    : null;
  const relatedItems = (related?.items ?? []).filter((p) => p.id !== product.id).slice(0, 8);

  const crumbs: Crumb[] = [
    { label: t("catalog.title"), path: "/catalog" },
    ...(category ? [{ label: category.name, path: `/catalog/${category.slug}` }] : []),
    { label: product.title },
  ];
  const path = `/product/${product.slug}`;
  const images = sortedImages(product);
  const inStock = stockOf(product, null) > 0;

  const brand = productBrandName(product);
  const markdown = (product.tags ?? []).some((tag) => tag.slug === "utsenka");
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
    ...(category ? { category: category.name } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: product.currency ?? "UAH",
      price: (product.priceMinor / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: shippingLd(),
      hasMerchantReturnPolicy: returnPolicyLd(markdown),
      seller: { "@type": "OnlineStore", "@id": ORG_ID, name: "ChiSetup", url: SITE_URL },
    },
  };

  return (
    <div className="container-site pt-6">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbJsonLd(locale, SITE_URL, crumbs, path)} />
      <Breadcrumbs locale={locale} items={crumbs} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <Gallery images={images} alt={product.title} />
        <div className="min-w-0">
          <BuyBox product={product} />
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

      {relatedItems.length > 0 && (
        <section className="mt-14" aria-labelledby="pd-related">
          <h2 id="pd-related" className="mb-5 flex items-center gap-3 font-display text-[22px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[28px]">
            <span aria-hidden className="tech-mark" />
            {t("product.related")}
          </h2>
          <ProductGrid products={toCardProducts(relatedItems.slice(0, 4))} />
        </section>
      )}
    </div>
  );
}
