/**
 * Site-wide constants. Server-only values (INTERNAL_API_BASE, SITE_INDEXABLE…) are read where they
 * are used, at request time, so one image runs in every environment; only NEXT_PUBLIC_* is inlined.
 */

/** Canonical public origin — used for metadataBase, canonical URLs, sitemap and OG images. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://maxsolkh.shop").replace(/\/$/, "");

/** The shop's Telegram bot (footer, contacts, login fallback). */
export const BOT_URL = process.env.NEXT_PUBLIC_BOT_URL ?? "https://t.me/maxsolch_bot";

/** Same-origin image entry point (gateway → nginx cache → imgproxy). Dev: rewritten to :8082. */
export const IMAGE_BASE = "/img";

export const SELLER = {
  name: "ФОП Солоха Максим Андрійович",
  taxId: "3547612413",
};

/** Catalog page size (spec: size ≤ 60). */
export const PAGE_SIZE = 24;

/** ISR window for catalog data, seconds. */
export const REVALIDATE_SECONDS = 60;
