import { CreditCard, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { imgproxyUrl, type StorefrontProduct } from "@shop/shared";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Breadcrumbs, breadcrumbJsonLd, JsonLd, type Crumb } from "@/components/layout/Breadcrumbs";
import { BuyBox } from "@/components/product/BuyBox";
import { Gallery } from "@/components/product/Gallery";
import { alternates, localePath, makeT, type MessageKey } from "@/i18n";
import { IMAGE_BASE, SITE_URL } from "@/lib/config";
import { stockOf } from "@/lib/stock";
import { localeOf } from "@/lib/route";
import { getProductBySlug, getProducts, safe } from "@/lib/server-api";

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

function summary(p: StorefrontProduct): string {
  if (p.seoDescription) return p.seoDescription;
  const text = (p.description ?? "").replace(/[•\s]+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text || p.title;
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
  const title = product.seoTitle || product.title;
  return {
    title,
    description: summary(product),
    alternates: alternates(`/product/${product.slug}`, locale),
    openGraph: {
      type: "website",
      title,
      description: summary(product),
      images: images.slice(0, 1).map((k) => ({ url: absoluteImage(k, 1200), width: 1200, height: 1200 })),
    },
  };
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

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.id,
    description: summary(product),
    image: images.slice(0, 6).map((k) => absoluteImage(k, 1200)),
    ...(category ? { category: category.name } : {}),
    brand: { "@type": "Brand", name: product.title.split(" ")[0] },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}${localePath(locale, path)}`,
      priceCurrency: product.currency ?? "UAH",
      price: (product.priceMinor / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "MAXSOLCH" },
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
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROMISES.map(({ icon: Icon, title, text, href }) => (
              <li key={title} className="nb-flat flex gap-3 bg-[var(--surface)] p-3.5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                <div className="min-w-0">
                  {href ? (
                    <a href={localePath(locale, href)} className="text-[13px] font-black uppercase tracking-wide text-[var(--ink)] hover:underline">
                      {t(title)}
                    </a>
                  ) : (
                    <p className="text-[13px] font-black uppercase tracking-wide text-[var(--ink)]">{t(title)}</p>
                  )}
                  <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--muted)]">{t(text)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-12 max-w-3xl" aria-labelledby="pd-desc">
        <h2 id="pd-desc" className="mb-4 text-[24px] font-black uppercase tracking-tight text-[var(--ink)]">
          {t("product.description")}
        </h2>
        <div className="nb p-5 sm:p-7">
          {product.description ? (
            <p className="whitespace-pre-line text-[15px] font-medium leading-relaxed text-[var(--ink)]">
              {product.description}
            </p>
          ) : (
            <p className="text-[15px] font-medium text-[var(--muted)]">{t("product.noDescription")}</p>
          )}
        </div>
      </section>

      {relatedItems.length > 0 && (
        <section className="mt-14" aria-labelledby="pd-related">
          <h2 id="pd-related" className="mb-5 text-[24px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[30px]">
            {t("product.related")}
          </h2>
          <ProductGrid products={relatedItems.slice(0, 4)} />
        </section>
      )}
    </div>
  );
}
