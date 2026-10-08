import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/CatalogView";
import { makeT } from "@/i18n";
import { catalogPageMeta } from "@/lib/seo";
import { parseCatalogState, type SearchParams } from "@/lib/catalog-params";
import { cardContext, computeListing, loadSchema, menuTree } from "@/lib/catalog";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getCategories, getListingProducts, safe } from "@/lib/server-api";

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
  // Filtered/sorted variants are the same content — out of the index; plain ?page=N stays in.
  return catalogPageMeta({
    locale,
    path: "/catalog",
    searchParams: await searchParams,
    title: (page) => (page > 1 ? `${t("catalog.title")}, ${t("meta.page", { n: page })}` : t("catalog.title")),
    description: t("meta.desc.catalog"),
  });
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
  // All products: only brand / price / condition / stock facets (no category → no attributes).
  const filter = { ...state.filter, q: undefined, attrs: {} };
  const [categories, schema, products] = await Promise.all([
    safe(getCategories(locale), []),
    loadSchema(locale),
    safe(getListingProducts(locale), null),
  ]);
  const listing = products ? computeListing(schema, products, { ...filter, category: null }, state.sort, state.page, locale) : null;
  return (
    <CatalogView
      locale={locale}
      title={t("catalog.title")}
      crumbs={[{ label: t("catalog.title") }]}
      state={{ ...state, filter }}
      listing={listing}
      tree={menuTree(categories)}
      activeSlug={null}
      hint
      card={cardContext(schema, locale)}
    />
  );
}
