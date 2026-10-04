import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/catalog/CatalogView";
import { breadcrumbJsonLd, JsonLd } from "@/components/layout/Breadcrumbs";
import { makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { parseCatalogState, toApiQuery, type SearchParams } from "@/lib/catalog-params";
import { SITE_URL } from "@/lib/config";
import { localeOf } from "@/lib/route";
import { catalogPageMeta, categoryTitle, categoryWords, metaPrice } from "@/lib/seo";
import { getCategories, getProducts, NotFoundError, safe } from "@/lib/server-api";

/**
 * Filters/sort/page live in the query string, so the page renders per request; the catalog DATA is
 * still cached for 60 s in the fetch cache (ISR at the data level, see lib/server-api).
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; category: string }>;

async function findCategory(slug: string, locale: Locale) {
  const categories = await safe(getCategories(locale), []);
  return { categories, category: categories.find((c) => c.slug === decodeURIComponent(slug)) ?? null };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const locale = await localeOf(params);
  const { category: slug } = await params;
  const t = makeT(locale);
  const { category } = await findCategory(slug, locale);
  if (!category) return { title: t("notFound.title") };
  const words = categoryWords(category.slug, category.name, locale);
  const cheapest =
    category.productCount > 0
      ? await safe(getProducts({ category: category.slug, sort: "price_asc", size: 1 }, locale), null)
      : null;
  const minPrice = cheapest?.items[0]?.priceMinor;
  const description =
    category.productCount > 0 && minPrice != null
      ? t("meta.categoryDescription", {
          name: words.name,
          count: t("catalog.count", { n: category.productCount }),
          price: metaPrice(minPrice, locale),
        })
      : t("meta.categoryDescriptionEmpty", { name: words.name });
  return catalogPageMeta({
    locale,
    path: `/catalog/${category.slug}`,
    searchParams: await searchParams,
    title: (page) => categoryTitle(category.slug, category.name, locale, page),
    description,
    // An empty category is a soft 404 for search engines: keep it out of the index (it stays in
    // the menu for visitors) but let crawlers follow its links.
    forceNoindex: category.productCount === 0,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const locale = await localeOf(params);
  const { category: slug } = await params;
  const t = makeT(locale);
  const { categories, category } = await findCategory(slug, locale);
  if (!category) notFound();
  const state = await parseCatalogState(`/catalog/${category.slug}`, searchParams);
  let data = null;
  try {
    data = await getProducts(toApiQuery(state, category.slug), locale);
  } catch (e) {
    // The API answers 404 for an unknown/hidden category slug.
    if (e instanceof NotFoundError) notFound();
  }
  const crumbs = [{ label: t("catalog.title"), path: "/catalog" }, { label: category.name }];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(locale, SITE_URL, crumbs, `/catalog/${category.slug}`)} />
      <CatalogView
        locale={locale}
        title={category.name}
        crumbs={crumbs}
        categories={categories}
        activeCategory={category.slug}
        state={state}
        data={data}
      />
    </>
  );
}
