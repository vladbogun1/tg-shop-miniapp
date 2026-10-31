import "server-only";
/**
 * SEO helpers: page metadata (canonical, hreflang, Open Graph, Twitter), search-only wording for
 * categories and products, and the schema.org bits shared by several pages.
 *
 * Everything here ends up in <head> or in JSON-LD only — none of it is rendered on the page, so the
 * visible site does not change. Per-category SEO texts (title, description, H1, intro) come from the
 * admin panel (`tags.seo_*`, translated); a field left empty falls back to the templates here, with
 * {@link CATEGORY_SEO} as the wording.
 */
import type { Metadata } from "next";
import { type Locale, LOCALE_TAG, LOCALES } from "@shop/core/i18n";
import { alternates, localePath } from "@/i18n";
import { SITE_URL } from "@/lib/config";
import { formatNumber, MINOR_PER_MAJOR } from "@shop/core/money";

export const SITE_NAME = "ChiSetup";

/** Default share picture (1200×630, brand cover) for pages without a product photo. */
export const DEFAULT_OG_IMAGE = { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: SITE_NAME };

/** Shop logo for schema.org (≥112 px raster, see docs/brand/v3). */
export const LOGO_URL = `${SITE_URL}/logo.png`;

/** `@id` of the store node; Product offers point their seller at it. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export interface OgImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

interface PageMetaInput {
  locale: Locale;
  /** Site path without the locale prefix. */
  path: string;
  /** Goes through the layout's "%s · ChiSetup" template unless `absoluteTitle`. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  image?: OgImage | null;
  ogType?: "website" | "article";
  /** Canonical/hreflang override (e.g. untranslated pages point at the Ukrainian original). */
  alternates?: Metadata["alternates"];
  robots?: Metadata["robots"];
}

/**
 * Full metadata for one page. Next replaces a parent's `openGraph`/`twitter` objects wholesale, so
 * every page has to send the complete set (url, site name, locale, picture) — not just a title.
 */
export function pageMeta(input: PageMetaInput): Metadata {
  const { locale, path, title, description } = input;
  const fullTitle = input.absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  const image = input.image ?? DEFAULT_OG_IMAGE;
  const alt = input.alternates ?? alternates(path, locale);
  const url = `${SITE_URL}${localePath(locale, path)}`;
  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: alt,
    openGraph: {
      type: input.ogType ?? "website",
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: LOCALES.filter((l) => l !== locale).map(ogLocale),
      url,
      title: fullTitle,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image.url],
    },
    ...(input.robots ? { robots: input.robots } : {}),
  };
}

export function ogLocale(locale: Locale): string {
  return LOCALE_TAG[locale].replace("-", "_");
}

/** Trims text to `max` characters on a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, "")}…`;
}

/** "650 ₴" / "650 UAH" for meta texts (no JS formatting quirks). */
export function metaPrice(minor: number, locale: Locale): string {
  // Kopecks only when there are any ("0,95 ₴") — rounding a price misleads.
  const opts = minor % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const n = formatNumber(minor / MINOR_PER_MAJOR, LOCALE_TAG[locale], opts).replace(/ | /g, " ");
  return locale === "en" ? `${n} UAH` : `${n} ₴`;
}

