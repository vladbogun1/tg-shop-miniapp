import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/catalog/CatalogView";
import { alternates, makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { parseCatalogState, toApiQuery, type SearchParams } from "@/lib/catalog-params";
import { localeOf } from "@/lib/route";
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
  const variant = Object.keys(await searchParams).length > 0;
  return {
    title: category.name,
    description: `${category.name} — ${t("meta.description")}`,
    alternates: alternates(`/catalog/${category.slug}`, locale),
    ...(variant ? { robots: { index: false, follow: true } } : {}),
  };
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
  return (
    <CatalogView
      locale={locale}
      title={category.name}
      crumbs={[{ label: t("catalog.title"), path: "/catalog" }, { label: category.name }]}
      categories={categories}
      activeCategory={category.slug}
      state={state}
      data={data}
    />
  );
}
