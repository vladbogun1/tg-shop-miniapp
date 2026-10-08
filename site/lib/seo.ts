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
import {
  guessProductBrand,
  type Locale,
  LOCALE_TAG,
  LOCALES,
  type StorefrontProduct,
} from "@shop/shared";
import { alternates, localePath, makeT } from "@/i18n";
import { BOT_URL, OWNER_TELEGRAM, SELLER, SITE_URL } from "./config";

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
  const n = (minor / 100).toLocaleString(LOCALE_TAG[locale], opts).replace(/ | /g, " ");
  return locale === "en" ? `${n} UAH` : `${n} ₴`;
}

// ---------------------------------------------------------------- categories

interface CategoryWords {
  /** Search-friendly plural name for <title>/description ("Ігрові килимки для миші"). */
  name: string;
  /** What one product of the category is, for product titles ("ігровий килимок для миші"). */
  item?: string;
}

/**
 * Search wording per category slug. Only used in <title>, meta description and OG — the visible H1
 * stays the category name from the admin panel. Unknown slugs fall back to the admin name.
 * Fallback only: the admin's `seoTitle` / `seoDescription` of a category win when filled in
 * (see {@link categoryTitle} and the category page).
 */
export const CATEGORY_SEO: Record<string, Record<Locale, CategoryWords>> = {
  kovriki: {
    uk: { name: "Ігрові килимки для миші", item: "ігровий килимок для миші" },
    ru: { name: "Игровые коврики для мыши", item: "игровой коврик для мыши" },
    en: { name: "Gaming mouse pads", item: "gaming mouse pad" },
  },
  "steklyannyy-pad": {
    uk: { name: "Скляні килимки для миші", item: "скляний килимок для миші" },
    ru: { name: "Стеклянные коврики для мыши", item: "стеклянный коврик для мыши" },
    en: { name: "Glass mouse pads", item: "glass mouse pad" },
  },
  glaydy: {
    uk: { name: "Глайди для миші", item: "глайди для миші" },
    ru: { name: "Глайды для мыши", item: "глайды для мыши" },
    en: { name: "Mouse skates", item: "mouse skates" },
  },
  myshki: {
    uk: { name: "Ігрові мишки", item: "ігрова мишка" },
    ru: { name: "Игровые мышки", item: "игровая мышка" },
    en: { name: "Gaming mice", item: "gaming mouse" },
  },
  "klv-magnitnye": {
    uk: { name: "Магнітні клавіатури Hall Effect", item: "магнітна клавіатура" },
    ru: { name: "Магнитные клавиатуры Hall Effect", item: "магнитная клавиатура" },
    en: { name: "Magnetic Hall Effect keyboards", item: "magnetic keyboard" },
  },
  "klv-mekhanicheskie": {
    uk: { name: "Механічні клавіатури", item: "механічна клавіатура" },
    ru: { name: "Механические клавиатуры", item: "механическая клавиатура" },
    en: { name: "Mechanical keyboards", item: "mechanical keyboard" },
  },
  keykapy: {
    uk: { name: "Кейкапи для клавіатури", item: "кейкапи для клавіатури" },
    ru: { name: "Кейкапы для клавиатуры", item: "кейкапы для клавиатуры" },
    en: { name: "Keycaps", item: "keycaps" },
  },
  kabelya: {
    uk: { name: "Кабелі для клавіатури та миші", item: "кабель" },
    ru: { name: "Кабели для клавиатуры и мыши", item: "кабель" },
    en: { name: "Keyboard and mouse cables", item: "cable" },
  },
  rukava: {
    uk: { name: "Ігрові рукави на руку", item: "ігровий рукав" },
    ru: { name: "Игровые рукава на руку", item: "игровой рукав" },
    en: { name: "Gaming arm sleeves", item: "gaming arm sleeve" },
  },
  naushniki: {
    uk: { name: "Ігрові навушники", item: "навушники" },
    ru: { name: "Игровые наушники", item: "наушники" },
    en: { name: "Gaming headphones", item: "headphones" },
  },
  "naushniki-polnorazmernye": {
    uk: { name: "Повнорозмірні ігрові навушники", item: "повнорозмірні навушники" },
    ru: { name: "Полноразмерные игровые наушники", item: "полноразмерные наушники" },
    en: { name: "Over-ear gaming headphones", item: "over-ear headphones" },
  },
  "naushniki-iem": {
    uk: { name: "Внутрішньоканальні навушники IEM", item: "IEM-навушники" },
    ru: { name: "Внутриканальные наушники IEM", item: "IEM-наушники" },
    en: { name: "In-ear monitors (IEM)", item: "in-ear monitors" },
  },
  "zvukovye-karty": {
    uk: { name: "Звукові карти та ЦАП для навушників" },
    ru: { name: "Звуковые карты и ЦАП для наушников" },
    en: { name: "Sound cards and headphone DACs" },
  },
  audio: {
    uk: { name: "Ігрове аудіо: навушники та звукові карти" },
    ru: { name: "Игровое аудио: наушники и звуковые карты" },
    en: { name: "Gaming audio: headphones and sound cards" },
  },
  klaviatury: {
    uk: { name: "Ігрові клавіатури", item: "ігрова клавіатура" },
    ru: { name: "Игровые клавиатуры", item: "игровая клавиатура" },
    en: { name: "Gaming keyboards", item: "gaming keyboard" },
  },
  "kovriki-tkanevye": {
    uk: { name: "Тканинні ігрові килимки для миші", item: "тканинний килимок для миші" },
    ru: { name: "Тканевые игровые коврики для мыши", item: "тканевый коврик для мыши" },
    en: { name: "Cloth gaming mouse pads", item: "cloth mouse pad" },
  },
  raznoe: {
    uk: { name: "Аксесуари для ігрового сетапу" },
    ru: { name: "Аксессуары для игрового сетапа" },
    en: { name: "Gaming setup accessories" },
  },
  mebel: {
    uk: { name: "Ігрові меблі: крісла та столи" },
    ru: { name: "Игровая мебель: кресла и столы" },
    en: { name: "Gaming furniture: chairs and desks" },
  },
  duyki: {
    uk: { name: "Дуйки — компресори для чищення ПК", item: "дуйка для чищення ПК" },
    ru: { name: "Дуйки — компрессоры для чистки ПК", item: "дуйка для чистки ПК" },
    en: { name: "Electric air dusters for PC cleaning", item: "electric air duster" },
  },
  kresla: {
    uk: { name: "Ігрові крісла", item: "ігрове крісло" },
    ru: { name: "Игровые кресла", item: "игровое кресло" },
    en: { name: "Gaming chairs", item: "gaming chair" },
  },
  stoly: {
    uk: { name: "Ігрові столи", item: "ігровий стіл" },
    ru: { name: "Игровые столы", item: "игровой стол" },
    en: { name: "Gaming desks", item: "gaming desk" },
  },
  utsenka: {
    uk: { name: "Уцінка — ігрова периферія зі знижкою" },
    ru: { name: "Уценка — игровая периферия со скидкой" },
    en: { name: "Discounted gaming gear" },
  },
};

export function categoryWords(slug: string | undefined | null, fallbackName: string, locale: Locale): CategoryWords {
  return (slug && CATEGORY_SEO[slug]?.[locale]) || { name: fallbackName };
}

/**
 * `<title>` of a category page: the admin's `seoTitle` when set, else "Ігрові килимки для миші —
 * купити в Україні" (+ " · ChiSetup" from the layout template either way).
 */
export function categoryTitle(slug: string, name: string, locale: Locale, page = 1, seoTitle?: string | null): string {
  const t = makeT(locale);
  const base = seoTitle?.trim() || `${categoryWords(slug, name, locale).name} — ${t("meta.buy")}`;
  return page > 1 ? `${base}, ${t("meta.page", { n: page })}` : base;
}

/**
 * Metadata of a catalog listing (/catalog, /catalog/{slug}).
 *
 * - no query, or only `?page=N`: indexable; page N is canonical to itself (with hreflang of the
 *   same page), so products from pages 2+ are reachable through crawlable listings;
 * - any filter/sort/search parameter: `noindex, follow`, canonical to the plain listing;
 * - `forceNoindex` (an empty category): `noindex, follow` whatever the query.
 */
export function catalogPageMeta(input: {
  locale: Locale;
  path: string;
  searchParams: Record<string, string | string[] | undefined>;
  title: (page: number) => string;
  description: string;
  forceNoindex?: boolean;
}): Metadata {
  const { locale, path, searchParams } = input;
  const keys = Object.keys(searchParams);
  const rawPage = searchParams.page;
  const pageNum = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const onlyPage = keys.length === 1 && keys[0] === "page" && Number.isInteger(pageNum) && pageNum >= 2;
  const variant = keys.length > 0 && !onlyPage;
  const page = onlyPage ? pageNum : 1;
  const t = makeT(locale);

  const withPage = (p: string) => (page > 1 ? `${p}?page=${page}` : p);
  const alt = alternates(path, locale);
  const pagedAlternates: Metadata["alternates"] = {
    canonical: withPage(alt.canonical),
    languages: Object.fromEntries(Object.entries(alt.languages).map(([k, v]) => [k, withPage(v)])),
  };

  const meta = pageMeta({
    locale,
    path,
    title: input.title(page),
    description: page > 1 ? `${input.description} (${t("meta.page", { n: page })})` : input.description,
    alternates: variant ? alt : pagedAlternates,
    robots: variant || input.forceNoindex ? { index: false, follow: true } : undefined,
  });
  if (page > 1 && meta.openGraph) meta.openGraph = { ...meta.openGraph, url: `${SITE_URL}${withPage(localePath(locale, path))}` };
  return meta;
}

// ---------------------------------------------------------------- products

/** `<title>` of a product without an admin seoTitle: "{title} — ігрова мишка, купити в Україні". */
export function productTitle(p: StorefrontProduct, locale: Locale, leaf?: { slug: string; name: string } | null): string {
  if (p.seoTitle) return p.seoTitle;
  const t = makeT(locale);
  // The leaf category: given by the caller (schema path), else the last of `tags` (= root, leaf).
  const tag = leaf ?? p.tags?.[p.tags.length - 1];
  const item = tag ? categoryWords(tag.slug, tag.name, locale).item : undefined;
  // Skip the type when the name already says it ("Килимок Attack Shark", "Cable, White").
  const lower = p.title.toLocaleLowerCase();
  const said = !!item && item.split(/\s+/).some((w) => w.length >= 5 && lower.includes(w.slice(0, 5).toLocaleLowerCase()));
  return item && !said ? `${p.title} — ${item}, ${t("meta.buy")}` : `${p.title} — ${t("meta.buy")}`;
}

/** Meta description: admin seoDescription, else the start of the description + price and delivery. */
export function productDescription(p: StorefrontProduct, locale: Locale): string {
  if (p.seoDescription) return p.seoDescription;
  const t = makeT(locale);
  const tail = t("meta.productDescription", { price: metaPrice(p.priceMinor, locale) });
  const text = (p.description ?? "").replace(/[•\s]+/g, " ").trim();
  const room = 200 - tail.length - 1;
  return text ? `${clip(text, room).replace(/[.!…]?$/, (m) => m || ".")} ${tail}` : `${p.title}. ${tail}`;
}

/**
 * The product's brand guessed from its texts, or null when we do not know it (then schema.org gets
 * no `brand` at all — better than a wrong one): a "Бренд: …" line in the description, then a known
 * brand name in the title (`guessProductBrand` in @shop/shared, also used by the admin's hint).
 * Fallback for {@link productBrandName}: the admin's `brand` field wins when filled in.
 */
export function productBrand(p: Pick<StorefrontProduct, "title" | "description">): string | null {
  return guessProductBrand(p);
}

/**
 * Brand for schema.org and feeds: the brand directory (`brandRef`, catalog v2), else the admin's old
 * text field, else the {@link productBrand} heuristic.
 */
export function productBrandName(p: Pick<StorefrontProduct, "title" | "description" | "brand" | "brandRef">): string | null {
  return p.brandRef?.name?.trim() || p.brand?.trim() || productBrand(p);
}

/** schema.org `sku`: the admin's article number, else the product id. */
export function productSku(p: Pick<StorefrontProduct, "id" | "sku">): string {
  return p.sku?.trim() || p.id;
}

// ---------------------------------------------------------------- schema.org

/** Store-wide return policy (site/content/legal/uk/returns.md): 14 days, by mail, buyer pays postage. */
export function returnPolicyLd(markdown = false) {
  if (markdown) {
    // «Уцінка»: sold with stated defects and not returnable for them (returns.md, «Уцінені товари»).
    return {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "UA",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    };
  }
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "UA",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  };
}

/**
 * Delivery (delivery-payment.md): Nova Poshta across Ukraine, shipped in 1–2 business days, 1–3 days
 * in transit. The price is the carrier's tariff paid by the buyer on receipt, so there is no fixed
 * `shippingRate` to state.
 */
export function shippingLd() {
  return {
    "@type": "OfferShippingDetails",
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
    },
  };
}

/**
 * The store (OnlineStore ⊂ Organization) and the website, for the home page. Contacts are the ones
 * the site really shows: Telegram only (no phone/e-mail exist), pickup city Kharkiv.
 */
export function storeJsonLd(locale: Locale) {
  const t = makeT(locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": ORG_ID,
        name: SITE_NAME,
        legalName: SELLER.name,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: LOGO_URL, width: 512, height: 512 },
        image: DEFAULT_OG_IMAGE.url,
        description: t("meta.description"),
        sameAs: [BOT_URL],
        address: { "@type": "PostalAddress", addressLocality: locale === "en" ? "Kharkiv" : locale === "ru" ? "Харьков" : "Харків", addressCountry: "UA" },
        areaServed: { "@type": "Country", name: "Ukraine" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          url: `https://t.me/${OWNER_TELEGRAM}`,
          availableLanguage: ["uk", "ru", "en"],
          areaServed: "UA",
        },
        hasMerchantReturnPolicy: returnPolicyLd(),
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, "/")}`,
        inLanguage: LOCALE_TAG[locale],
        publisher: { "@id": ORG_ID },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}${localePath(locale, "/search")}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
