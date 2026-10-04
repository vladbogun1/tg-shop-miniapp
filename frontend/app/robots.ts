import type { MetadataRoute } from "next";

/**
 * The Mini App (app.chisetup.com.ua) is not for search engines — the indexable shop is the website
 * (chisetup.com.ua). Pages also carry `noindex` (layout metadata) and `X-Robots-Tag`
 * (next.config.ts). Telegram ignores all of this.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
