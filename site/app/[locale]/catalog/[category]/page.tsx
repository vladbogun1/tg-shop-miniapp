import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { categoryBySlug, categoryPath, type Locale, MARKDOWN_COLLECTION_SLUG } from "@shop/shared";
import { CatalogView } from "@/components/catalog/CatalogView";
import { breadcrumbJsonLd, JsonLd } from "@/components/layout/Breadcrumbs";
import { makeT } from "@/i18n";
import { parseCatalogState, type SearchParams } from "@/lib/catalog-params";
import { cardContext, computeListing, loadSchema, menuTree, rootOf } from "@/lib/catalog";
import { SITE_URL } from "@/lib/config";
import { localeOf } from "@/lib/route";
import { CategoryIntro, SHOW_CATEGORY_INTRO } from "@/components/catalog/CategoryIntro";
import { catalogPageMeta, categoryTitle, categoryWords, metaPrice } from "@/lib/seo";
import { getCategories, getCategory, getListingProducts, NotFoundError, safe } from "@/lib/server-api";

/**
 * Filters/sort/page live in the query string, so the page renders per request; the catalog DATA is
 * still cached for 60 s in the fetch cache (ISR at the data level, see lib/server-api).
 *
 * A category is a root (its page lists the whole subtree), a leaf, a category hidden from the menu
 * (still reachable by its URL) or the virtual «Уцінка» collection (condition ≠ NEW).
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; category: string }>;

/** Everything the page and its metadata need; null = unknown slug. Deduplicated per request. */
const resolveCategory = cache(async (rawSlug: string, locale: Locale) => {
  const slug = decodeURIComponent(rawSlug);
  const t = makeT(locale);
  const [schema, categories, detail] = await Promise.all([
    loadSchema(locale),
    safe(getCategories(locale), []),
    // SEO of the page (title, description, H1, intro; translated) — also answers for hidden ones.
    safe(getCategory(slug, locale), null),
  ]);
  const isSale = slug === MARKDOWN_COLLECTION_SLUG;
  const node = isSale ? null : categoryBySlug(schema, slug);
  const menu = categories.find((c) => c.slug === slug) ?? null;
  if (!isSale && !node && !detail && !menu) return null;
  const canonical = node?.slug ?? detail?.slug ?? menu?.slug ?? slug;
  const name = node?.name ?? detail?.name ?? menu?.name ?? (isSale ? t("catalog.markdownTitle") : slug);
  const productCount = node?.productCount ?? menu?.productCount ?? detail?.productCount ?? 0;
  let products = null;
  try {
    products = await getListingProducts(locale, { category: canonical });
  } catch (e) {
    // The API answers 404 for a slug it does not know.
    if (e instanceof NotFoundError) return null;
  }
  return { slug: canonical, name, productCount, isSale, node, detail, schema, categories, products };
});

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
  const c = await resolveCategory(slug, locale);
  if (!c) return { title: t("notFound.title") };
  const seo = c.detail;
  const words = categoryWords(c.slug, c.name, locale);
  const count = c.products?.length ?? c.productCount;
  const minPrice = c.products?.length ? Math.min(...c.products.map((p) => p.priceMinor)) : null;
  const description =
    seo?.seoDescription?.trim() ||
    (count > 0 && minPrice != null
      ? t("meta.categoryDescription", {
          name: words.name,
          count: t("catalog.count", { n: count }),
          price: metaPrice(minPrice, locale),
        })
      : t("meta.categoryDescriptionEmpty", { name: words.name }));
  return catalogPageMeta({
    locale,
    path: `/catalog/${c.slug}`,
    searchParams: await searchParams,
    title: (page) => categoryTitle(c.slug, c.name, locale, page, seo?.seoTitle),
    description,
    // An empty category is a soft 404 for search engines: keep it out of the index (it stays
    // reachable for visitors) but let crawlers follow its links.
    forceNoindex: count === 0,
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
  const c = await resolveCategory(slug, locale);
  if (!c) notFound();
  const state = await parseCatalogState(`/catalog/${c.slug}`, searchParams);
  // «Уцінка» is a condition collection: no condition facet, no condition filter.
  const filter = { ...state.filter, q: undefined, ...(c.isSale ? { conditions: [] } : {}) };
  const listing = c.products ? computeListing(c.schema, c.products, { ...filter, category: c.slug }, state.sort, state.page, locale) : null;

  const heading = c.detail?.h1?.trim() || c.name;
  const intro = c.detail?.introText?.trim();
  const path = c.node ? categoryPath(c.schema, c.node.id) : [];
  const crumbs = [
    { label: t("catalog.title"), path: "/catalog" },
    ...path.slice(0, -1).map((p) => ({ label: p.name, path: `/catalog/${p.slug}` })),
    { label: c.name },
  ];
  const tree = menuTree(c.categories, c.slug);
  const root = rootOf(tree, c.slug);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(locale, SITE_URL, crumbs, `/catalog/${c.slug}`)} />
      <CatalogView
        locale={locale}
        title={heading}
        crumbs={crumbs}
        state={{ ...state, filter }}
        listing={listing}
        tree={tree}
        activeSlug={c.slug}
        chips={root && root.children.length > 0 ? { root, children: root.children } : null}
        card={cardContext(c.schema, locale)}
        footer={
          SHOW_CATEGORY_INTRO && intro && state.page === 1 ? (
            <CategoryIntro locale={locale} title={heading} text={intro} />
          ) : null
        }
      />
    </>
  );
}
