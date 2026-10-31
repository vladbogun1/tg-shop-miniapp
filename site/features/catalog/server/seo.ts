import "server-only";
import { type Locale } from "@shop/core/i18n";
import type { Metadata } from "next";
import { alternates, localePath, makeT } from "@/i18n";
import { SITE_URL } from "@/lib/config";
import { pageMeta } from "@/features/seo/server";
import { CATEGORY_SEO, type CategoryWords } from "./seo.data";

export function categoryWords(slug: string | undefined | null, fallbackName: string, locale: Locale): CategoryWords {
  return (slug && CATEGORY_SEO[slug]?.[locale]) || { name: fallbackName };
}

/**
 * `<title>` of a category page: the admin's `seoTitle` when set, else "Ігрові килимки для миші —
 * купити в Україні" (+ " · ChiSetup" from the layout template either way).
 */
export function categoryTitle(slug: string, name: string, locale: Locale, page = 1, seoTitle?: string | null): string {
  const t = makeT(locale);
  const base = seoTitle?.trim() || `${categoryWords(slug, name, locale).name} — ${t("meta.buy")}`;
  return page > 1 ? `${base}, ${t("meta.page", { n: page })}` : base;
}

/**
 * Metadata of a catalog listing (/catalog, /catalog/{slug}).
 *
 * - no query, or only `?page=N`: indexable; page N is canonical to itself (with hreflang of the
 *   same page), so products from pages 2+ are reachable through crawlable listings;
 * - any filter/sort/search parameter: `noindex, follow`, canonical to the plain listing;
 * - `forceNoindex` (an empty category): `noindex, follow` whatever the query.
 */
export function catalogPageMeta(input: {
  locale: Locale;
  path: string;
  searchParams: Record<string, string | string[] | undefined>;
  title: (page: number) => string;
  description: string;
  forceNoindex?: boolean;
}): Metadata {
  const { locale, path, searchParams } = input;
  const keys = Object.keys(searchParams);
  const rawPage = searchParams.page;
  const pageNum = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const onlyPage = keys.length === 1 && keys[0] === "page" && Number.isInteger(pageNum) && pageNum >= 2;
  const variant = keys.length > 0 && !onlyPage;
  const page = onlyPage ? pageNum : 1;
  const t = makeT(locale);

  const withPage = (p: string) => (page > 1 ? `${p}?page=${page}` : p);
  const alt = alternates(path, locale);
  const pagedAlternates: Metadata["alternates"] = {
    canonical: withPage(alt.canonical),
    languages: Object.fromEntries(Object.entries(alt.languages).map(([k, v]) => [k, withPage(v)])),
  };

  const meta = pageMeta({
    locale,
    path,
    title: input.title(page),
    description: page > 1 ? `${input.description} (${t("meta.page", { n: page })})` : input.description,
    alternates: variant ? alt : pagedAlternates,
    robots: variant || input.forceNoindex ? { index: false, follow: true } : undefined,
  });
  if (page > 1 && meta.openGraph) meta.openGraph = { ...meta.openGraph, url: `${SITE_URL}${withPage(localePath(locale, path))}` };
  return meta;
}

