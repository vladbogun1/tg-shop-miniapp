import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/** Closed to crawlers until launch: SITE_INDEXABLE=true opens it (read at request time). */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXABLE !== "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account", "/checkout", "/login", "/cart", "/search", "/ru/account", "/en/account", "/ru/checkout", "/en/checkout"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
