import type { MetadataRoute } from "next";
import { localePath } from "@/i18n";
import { LOCALES } from "@shop/shared";
import { SITE_URL } from "@/lib/config";
import { untranslatedLegalPaths } from "@/lib/legal";
import { getCategories, getSitemap, safe } from "@/lib/server-api";

/** Built per request from /api/public/sitemap (the build has no backend); data cached for 60 s. */
export const dynamic = "force-dynamic";

const STATIC = ["/", "/catalog", "/delivery", "/returns", "/warranty", "/privacy", "/terms", "/contacts", "/about"];

const abs = (path: string, locale: (typeof LOCALES)[number]) => `${SITE_URL}${localePath(locale, path)}`;

/**
 * One <url> per language version, each listing the full set of alternates + x-default (Google
 * wants every version as its own entry). A legal page missing a translation is listed in Ukrainian
 * only — its untranslated copies are canonical to it (see legalPageMeta).
 */
function entries(path: string, lastModified?: string | null): MetadataRoute.Sitemap {
  const lm = lastModified ? { lastModified } : {};
  if (untranslatedLegalPaths(LOCALES).includes(path)) {
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
