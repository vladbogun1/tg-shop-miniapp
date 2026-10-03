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
  const [categories, data] = await Promise.all([
    safe(getCategories(locale), []),
    state.q ? safe(getProducts(toApiQuery(state), locale), null) : Promise.resolve(null),
  ]);

  if (!state.q) {
    return (
      <div className="container-site pt-10">
        <h1 className="text-[32px] font-black uppercase text-[var(--ink)]">{t("search.title")}</h1>
        <p className="nb mt-6 p-6 text-[15px] font-bold text-[var(--muted)]">{t("search.prompt")}</p>
      </div>
    );
  }

  return (
    <CatalogView
      locale={locale}
      title={t("search.resultsFor", { q: state.q })}
      crumbs={[{ label: t("search.title") }]}
      categories={categories}
      activeCategory={null}
      state={state}
      data={data}
    />
  );
}
