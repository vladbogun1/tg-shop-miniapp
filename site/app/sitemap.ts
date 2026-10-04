import type { MetadataRoute } from "next";
import { localePath } from "@/i18n";
import { LOCALES } from "@/i18n/locales";
import { SITE_URL } from "@/lib/config";
import { UK_ONLY_PATHS } from "@/lib/seo";
import { getCategories, getSitemap, safe } from "@/lib/server-api";

/** Built per request from /api/public/sitemap (the build has no backend); data cached for 60 s. */
export const dynamic = "force-dynamic";

const STATIC = ["/", "/catalog", "/delivery", "/returns", "/warranty", "/privacy", "/terms", "/contacts", "/about"];

const abs = (path: string, locale: (typeof LOCALES)[number]) => `${SITE_URL}${localePath(locale, path)}`;

/**
 * One <url> per language version, each listing the full set of alternates + x-default (Google
 * wants every version as its own entry). Untranslated legal pages are listed in Ukrainian only —
 * their ru/en copies are canonical to it.
 */
function entries(path: string, lastModified?: string | null): MetadataRoute.Sitemap {
  const lm = lastModified ? { lastModified } : {};
  if (UK_ONLY_PATHS.includes(path)) {
    return [{ url: abs(path, "uk"), ...lm }];
  }
  const languages = {
    ...Object.fromEntries(LOCALES.map((l) => [l, abs(path, l)])),
    "x-default": abs(path, "uk"),
  };
  return LOCALES.map((l) => ({ url: abs(path, l), ...lm, alternates: { languages } }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [data, menu] = await Promise.all([
    safe(getSitemap(), { products: [], categories: [] }),
    safe(getCategories("uk"), null),
  ]);
  // Empty categories are noindex (soft 404) — keep them out. The backend already skips them; this
  // also covers an older backend.
  const empty = new Set((menu ?? []).filter((c) => c.productCount === 0).map((c) => c.slug));
  const newest = data.products.reduce<string | null>(
    (max, p) => (p.updatedAt && (!max || Date.parse(p.updatedAt) > Date.parse(max)) ? p.updatedAt : max),
    null
  );
  return [
    ...STATIC.flatMap((p) => entries(p, p === "/" || p === "/catalog" ? newest : null)),
    ...data.categories.filter((c) => !empty.has(c.slug)).flatMap((c) => entries(`/catalog/${c.slug}`, c.updatedAt)),
    ...data.products.flatMap((p) => entries(`/product/${p.slug}`, p.updatedAt)),
  ];
}
