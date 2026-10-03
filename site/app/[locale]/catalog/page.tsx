import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/CatalogView";
import { alternates, makeT } from "@/i18n";
import { parseCatalogState, toApiQuery, type SearchParams } from "@/lib/catalog-params";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getCategories, getProducts, safe } from "@/lib/server-api";

/**
 * Filters/sort/page live in the query string, so the page renders per request; the catalog DATA is
 * still cached for 60 s in the fetch cache (ISR at the data level, see lib/server-api).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const sp = await searchParams;
  // Filtered/sorted/paged variants are the same content — keep them out of the index.
  const variant = Object.keys(sp).length > 0;
  return {
    title: t("catalog.title"),
    description: t("meta.description"),
    alternates: alternates("/catalog", locale),
    ...(variant ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: SearchParams;
}) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const state = await parseCatalogState("/catalog", searchParams);
  const [categories, data] = await Promise.all([
    safe(getCategories(), []),
    safe(getProducts(toApiQuery(state)), null),
  ]);
  return (
    <CatalogView
      locale={locale}
      title={t("catalog.title")}
      crumbs={[{ label: t("catalog.title") }]}
      categories={categories}
      activeCategory={null}
      state={state}
      data={data}
    />
  );
}
