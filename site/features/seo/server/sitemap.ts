import "server-only";
import type { PublicSitemap } from "@shop/core/site";
import { getJson } from "@/lib/server-http";

/** Slugs only — language-independent. */
export async function getSitemap(): Promise<PublicSitemap> {
  return getJson<PublicSitemap>("/api/public/sitemap", null);
}
