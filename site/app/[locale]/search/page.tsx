import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/CatalogView";
import { alternates, makeT } from "@/i18n";
import { parseCatalogState, type SearchParams } from "@/lib/catalog-params";
import { cardContext, computeListing, loadSchema, menuTree } from "@/lib/catalog";
import { localeOf, type LocaleParams } from "@/lib/route";
import { getCategories, getListingProducts, safe } from "@/lib/server-api";

/**
 * Filters/sort/page live in the query string, so the page renders per request; the catalog DATA is
 * still cached for 60 s in the fetch cache (ISR at the data level, see lib/server-api).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = makeT(locale);
  return {
    title: t("search.title"),
    alternates: alternates("/search", locale),
    // Search result pages are infinite and thin — never index them.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: SearchParams;
}) {
  const locale = await localeOf(params);
  const t = makeT(locale);
  const state = await parseCatalogState("/search", searchParams);
  const q = state.filter.q;

  if (!q) {
    return (
      <div className="container-site pt-10">
        <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("search.title")}</h1>
        <p className="nb mt-6 p-6 text-[15px] font-medium text-[var(--muted)]">{t("search.prompt")}</p>
      </div>
    );
  }

  // The backend searches (title, description, brand); the site filters the hits like a category.
  const filter = { ...state.filter, attrs: {} };
  const [categories, schema, products] = await Promise.all([
    safe(getCategories(locale), []),
    loadSchema(locale),
    safe(getListingProducts(locale, { q }), null),
  ]);
  const listing = products ? computeListing(schema, products, { ...filter, category: null }, state.sort, state.page, locale, state.from) : null;
  return (
    <CatalogView
      locale={locale}
      title={t("search.resultsFor", { q })}
      crumbs={[{ label: t("search.title") }]}
      state={{ ...state, filter }}
      listing={listing}
      tree={menuTree(categories)}
      activeSlug={null}
      card={cardContext(schema, locale)}
    />
  );
}
