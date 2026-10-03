import type { MetadataRoute } from "next";
import { localePath } from "@/i18n";
import { LOCALES } from "@/i18n/locales";
import { SITE_URL } from "@/lib/config";
import { getSitemap, safe } from "@/lib/server-api";

/** Built per request from /api/public/sitemap (the build has no backend); data cached for 60 s. */
export const dynamic = "force-dynamic";

const STATIC = ["/", "/catalog", "/delivery", "/returns", "/warranty", "/privacy", "/terms", "/contacts", "/about"];

function entry(path: string, lastModified?: string | null): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${localePath("uk", path)}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localePath(l, path)}`])),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await safe(getSitemap(), { products: [], categories: [] });
  return [
    ...STATIC.map((p) => entry(p)),
    ...data.categories.map((c) => entry(`/catalog/${c.slug}`)),
    ...data.products.map((p) => entry(`/product/${p.slug}`, p.updatedAt)),
  ];
}
