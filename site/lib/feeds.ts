/**
 * Product feeds for price comparison / shopping surfaces:
 *
 *   /feeds/google.xml      Google Merchant Center (RSS 2.0 + the g: namespace), Ukrainian
 *   /feeds/google-uk.xml   the same (the name docs/SEO-GROWTH-GUIDE.md uses)
 *   /feeds/google-ru.xml   the same in Russian, links to /ru/… (optional second feed)
 *   /feeds/hotline.xml     Hotline.ua price list (their own XML: firm, categories, items), Ukrainian
 *
 * All list only public products (the backend's /api/public/products = active, not archived) that
 * have a menu category and at least one photo. Links are the product pages of the feed's language,
 * pictures are absolute JPEG renders through imgproxy — some feed crawlers still do not take WebP,
 * which imgproxy serves by default.
 *
 * Language: most descriptions exist only in Russian so far (the backend falls back to the Russian
 * source when a translation is missing). A Ukrainian feed with Russian text is a language mismatch
 * for Merchant Center, so in a non-Russian feed a description that is evidently Russian is replaced
 * by a short generated one in the feed's language; real translations replace it automatically.
 *
 * Nothing here is rendered on the site.
 */
import { imgproxyUrl, type PublicCategory, type StorefrontProduct, type StorefrontTag } from "@shop/shared";
import { localePath, makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { IMAGE_BASE, SITE_URL } from "./config";
import { categoryWords, productBrand, SITE_NAME } from "./seo";
import { stockOf } from "./stock";

/** Feed data window, seconds (admin edits still drop it early through the "catalog" tag). */
export const FEED_REVALIDATE_SECONDS = 3600;

const MARKDOWN_SLUG = "utsenka";

// ---------------------------------------------------------------- XML helpers

/** Characters XML 1.0 does not allow at all (control codes except tab/LF/CR, lone surrogates…). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `<name>value</name>`, or nothing for an empty value. */
function el(name: string, value: string | number | null | undefined, attrs = ""): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}${attrs}>${xmlEscape(String(value))}</${name}>`;
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Crawlers fetch a feed a few times a day; an hour keeps it fresh enough for prices.
      "Cache-Control": `public, max-age=${FEED_REVALIDATE_SECONDS}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

// ---------------------------------------------------------------- product data

/** Optional identifiers the backend may send in the future (article, barcode, manufacturer code). */
interface MaybeIdentifiers {
  sku?: string | null;
  gtin?: string | null;
  mpn?: string | null;
}

export interface FeedItem {
  product: StorefrontProduct;
  category: StorefrontTag;
  /** Search wording of the category in the feed's language ("Ігрові килимки для миші"). */
  categoryName: string;
  url: string;
  images: string[];
  inStock: boolean;
  /** «Уцінка»: sold with stated defects. */
  markdown: boolean;
  brand: string | null;
  description: string;
  sku: string | null;
  gtin: string | null;
  mpn: string | null;
}

/** Absolute JPEG render of a stored picture (absolute legacy URLs are used as they are). */
export function feedImage(key: string): string {
  if (/^https?:\/\//i.test(key)) return key;
  return `${SITE_URL}${imgproxyUrl(IMAGE_BASE, key.replace(/^\/+/, ""), 1200, true).replace(/@webp$/, "@jpg")}`;
}

/**
 * The category a product is listed under: its first menu category other than «Уцінка»; a product
 * that is only in «Уцінка» keeps that one. null = no menu category (not exported).
 */
function feedCategory(p: StorefrontProduct, menu: Map<string, PublicCategory>): StorefrontTag | null {
  const tags = (p.tags ?? []).filter((t) => t.slug && menu.has(t.slug));
  return tags.find((t) => t.slug !== MARKDOWN_SLUG) ?? tags[0] ?? null;
}

/** Plain text for feeds: no bullet glyph runs, collapsed blank lines, trimmed to `max`. */
function feedText(text: string, max: number): string {
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Russian-only letters present and no Ukrainian-only ones. */
function looksRussian(text: string): boolean {
  return /[ыэъё]/i.test(text) && !/[іїєґ]/i.test(text);
}

/**
 * Feed description in `locale`: the product's own text, or — when there is none or it is evidently
 * in another language — "{title} — {what it is}. {delivery line}" in the feed's language.
 */
function description(p: StorefrontProduct, category: StorefrontTag, locale: Locale): string {
  const own = (p.description ?? "").trim();
  if (own && (locale === "ru" || !looksRussian(own))) return feedText(own, 5000);
  const item = categoryWords(category.slug, category.name, locale).item;
  const delivery = makeT(locale)("meta.productDescription", { price: "" }).replace(/^[^.]*\.\s*/, "");
  return feedText(`${p.title}${item ? ` — ${item}` : ""}. ${delivery}`, 5000);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function feedItems(products: StorefrontProduct[], categories: PublicCategory[], locale: Locale): FeedItem[] {
  const menu = new Map(categories.map((c) => [c.slug, c]));
  const items: FeedItem[] = [];
  for (const p of products) {
    if (p.active === false || p.archived === true) continue;
    const category = feedCategory(p, menu);
    if (!category) continue;
    const images = (p.images ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((i) => i.url)
      .filter((u): u is string => !!u)
      .map(feedImage);
    if (images.length === 0) continue;
    const ids = p as StorefrontProduct & MaybeIdentifiers;
    items.push({
      product: p,
      category,
      categoryName: categoryWords(category.slug, category.name, locale).name,
      url: `${SITE_URL}${localePath(locale, `/product/${p.slug}`)}`,
      images,
      inStock: stockOf(p, null) > 0,
      markdown: (p.tags ?? []).some((t) => t.slug === MARKDOWN_SLUG),
      brand: productBrand(p),
      description: description(p, category, locale),
      sku: str(ids.sku),
      gtin: str(ids.gtin),
      mpn: str(ids.mpn),
    });
  }
  return items;
}

const price = (minor: number) => (minor / 100).toFixed(2);

// ---------------------------------------------------------------- Google Merchant Center

/**
 * Google product taxonomy ids per category slug (checked against taxonomy-with-ids.en-US.txt).
 * Unknown slugs get no google_product_category — Google then picks one itself.
 */
const GOOGLE_CATEGORY: Record<string, number> = {
  kovriki: 1993, // Electronics > Electronics Accessories > Computer Accessories > Mouse Pads
  "steklyannyy-pad": 1993,
  glaydy: 500052, // … > Input Device Accessories > Mice & Trackball Accessories
  myshki: 304, // … > Computer Components > Input Devices > Mice & Trackballs
  "klv-magnitnye": 303, // … > Input Devices > Keyboards
  "klv-mekhanicheskie": 303,
  keykapy: 503003, // … > Input Device Accessories > Keyboard Keys & Caps
  kabelya: 259, // Electronics > Electronics Accessories > Cables
  rukava: 5942, // Apparel & Accessories > Clothing Accessories > Arm Warmers & Sleeves
  naushniki: 505771, // Electronics > Audio > Audio Components > Headphones & Headsets
  duyki: 4617, // Electronics > Electronics Accessories > Electronics Cleaners
  kresla: 6800, // Furniture > Chairs > Gaming Chairs
  stoly: 4191, // Furniture > Office Furniture > Desks
};

/**
 * Shipping: Nova Poshta across Ukraine, the buyer pays the carrier's tariff on receipt — there is no
 * fixed price, and Google's `g:shipping` needs one. So the feed carries it only when the owner sets
 * an estimate (`FEED_SHIPPING_PRICE_UAH`, e.g. 80); otherwise shipping is configured in Merchant
 * Center itself. Handling time (1–2 business days) is always sent.
 */
function googleShipping(): string {
  const raw = process.env.FEED_SHIPPING_PRICE_UAH?.trim();
  const value = raw ? Number(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(value) || value < 0) return "";
  return (
    "<g:shipping>" +
    el("g:country", "UA") +
    el("g:service", "Нова Пошта") +
    el("g:price", `${value.toFixed(2)} UAH`) +
    el("g:min_handling_time", 1) +
    el("g:max_handling_time", 2) +
    el("g:min_transit_time", 1) +
    el("g:max_transit_time", 3) +
    "</g:shipping>"
  );
}

function googleItem(it: FeedItem, shipping: string): string {
  const p = it.product;
  const sale = p.compareAtMinor != null && p.compareAtMinor > p.priceMinor;
  const currency = p.currency ?? "UAH";
  const googleCategory = it.category.slug ? GOOGLE_CATEGORY[it.category.slug] : undefined;
  const hasIdentifier = !!(it.gtin || (it.brand && it.mpn));
  return [
    "<item>",
    el("g:id", p.id),
    el("title", feedText(p.title, 150)),
    el("description", it.description),
    el("link", it.url),
    el("g:image_link", it.images[0]),
    ...it.images.slice(1, 11).map((u) => el("g:additional_image_link", u)),
    el("g:price", `${price(sale ? p.compareAtMinor! : p.priceMinor)} ${currency}`),
    sale ? el("g:sale_price", `${price(p.priceMinor)} ${currency}`) : "",
    el("g:availability", it.inStock ? "in_stock" : "out_of_stock"),
    // «Уцінка» is sold with stated defects (returns.md), not professionally restored — Google's
    // "refurbished" would be wrong, "used" is the honest one.
    el("g:condition", it.markdown ? "used" : "new"),
    el("g:brand", it.brand),
    el("g:gtin", it.gtin),
    el("g:mpn", it.mpn),
    hasIdentifier ? "" : el("g:identifier_exists", "no"),
    el("g:google_product_category", googleCategory),
    el("g:product_type", it.categoryName),
    shipping,
    el("g:min_handling_time", shipping ? "" : 1),
    el("g:max_handling_time", shipping ? "" : 2),
    "</item>",
  ].join("");
}

export function googleFeed(items: FeedItem[], locale: Locale): string {
  const shipping = googleShipping();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    el("title", SITE_NAME),
    el("link", `${SITE_URL}/`),
    el("description", makeT(locale)("meta.description")),
    ...items.map((it) => googleItem(it, shipping)),
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- Hotline.ua

/** Stable numeric id for a category slug (Hotline wants integers; tag ids are UUIDs). */
function numericId(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000_000 || 1;
}

/** Consumables: no shop warranty, only the 14-day return (warranty.md). */
const NO_WARRANTY = new Set(["glaydy", "keykapy", "kabelya", "rukava"]);
/** Shop warranty when the product page states none (warranty.md), months. */
const WARRANTY_MONTHS = 6;

function kyivTimestamp(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Hotline compares offers of NEW goods by model, and a click on an unavailable offer is paid for
 * nothing — so the price list carries in-stock, non-markdown products only.
 */
export function hotlineFeed(items: FeedItem[], now = new Date()): string {
  const listed = items.filter((it) => it.inStock && !it.markdown);
  const categories = new Map<string, string>();
  for (const it of listed) categories.set(it.category.slug!, it.categoryName);
  const firmId = process.env.HOTLINE_FIRM_ID?.trim();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<price>",
    el("date", kyivTimestamp(now)),
    el("firmName", SITE_NAME),
    el("firmId", firmId),
    "<categories>",
    ...[...categories].map(([slug, name]) => `<category>${el("id", numericId(slug))}${el("name", name)}</category>`),
    "</categories>",
    "<items>",
    ...listed.map((it) => {
      const p = it.product;
      const warranty = it.category.slug && !NO_WARRANTY.has(it.category.slug) ? WARRANTY_MONTHS : null;
      return [
        "<item>",
        el("id", p.id),
        el("categoryId", numericId(it.category.slug!)),
        el("code", it.mpn ?? it.sku),
        el("barcode", it.gtin),
        el("vendor", it.brand),
        el("name", feedText(p.title, 250)),
        el("description", it.description),
        el("url", it.url),
        ...it.images.slice(0, 10).map((u) => el("image", u)),
        el("priceRUAH", price(p.priceMinor)),
        p.compareAtMinor != null && p.compareAtMinor > p.priceMinor ? el("oldprice", price(p.compareAtMinor)) : "",
        el("stock", "В наличии"),
        warranty ? el("guarantee", warranty, ' type="shop"') : "",
        "</item>",
      ].join("");
    }),
    "</items>",
    "</price>",
    "",
  ].join("\n");
}
