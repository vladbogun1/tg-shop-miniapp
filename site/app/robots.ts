import type { MetadataRoute } from "next";
import { localePath } from "@/i18n";
import { LOCALES } from "@/i18n/locales";
import { SITE_URL } from "@/lib/config";

/** Closed to crawlers until launch: SITE_INDEXABLE=true opens it (read at request time). */
export const dynamic = "force-dynamic";

/** Personal and service pages, in every language (they also carry noindex themselves). */
const PRIVATE = ["/account", "/checkout", "/login", "/cart", "/search"];

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXABLE !== "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...LOCALES.flatMap((l) => PRIVATE.map((p) => localePath(l, p)))],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
