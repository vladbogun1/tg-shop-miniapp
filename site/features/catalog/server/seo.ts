import "server-only";
import { type Locale } from "@shop/core/i18n";
import type { Metadata } from "next";
import { alternates, localePath, makeT } from "@/i18n";
import { SITE_URL } from "@/lib/config";
import { pageMeta } from "@/features/seo/server";

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

