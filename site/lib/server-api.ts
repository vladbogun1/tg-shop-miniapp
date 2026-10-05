/**
 * Server-side data access for server components (SSR/ISR).
 *
 * Talks to the backend directly over the internal network (`INTERNAL_API_BASE`, e.g.
 * `http://backend:8080` in docker) with Next's data cache: every response is cached for
 * {@link REVALIDATE_SECONDS} and tagged, so `/_site/revalidate` can drop it early after an admin edit.
 *
 * Catalog content is translated per language (docs/CONTENT-I18N.md), so every catalog call carries
 * the page's locale twice: `Accept-Language` (what the backend normally reads) AND `?lang=` — Next's
 * fetch cache keys on the URL, not on headers, so without the query parameter a cached Russian
 * response could be served to the Ukrainian page of the same path.
 */
import type {
  CatalogSort,
  PaymentOption,
  PublicCategory,
  PublicCategoryDetail,
  PublicProductPage,
  PublicSitemap,
  StorefrontProduct,
} from "@shop/shared";
import type { Locale } from "@/i18n/locales";
import { catalogSearchParams, type CatalogQuery } from "./api";
import { PAGE_SIZE, REVALIDATE_SECONDS } from "./config";

function apiBase(): string {
  return (process.env.INTERNAL_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
}

export class NotFoundError extends Error {}

/** Appends `lang=<locale>` to a backend path (which may already have a query string). */
function withLang(path: string, locale: Locale): string {
  return `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;
}

async function getJson<T>(path: string, locale: Locale | null, tags: string[] = ["catalog"]): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (locale) headers["Accept-Language"] = locale;
  const res = await fetch(`${apiBase()}${locale ? withLang(path, locale) : path}`, {
    headers,
    next: { revalidate: REVALIDATE_SECONDS, tags },
  });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const SORTS: CatalogSort[] = ["default", "price_asc", "price_desc", "new", "name"];

export function parseSort(value: string | undefined): CatalogSort {
  return (SORTS as string[]).includes(value ?? "") ? (value as CatalogSort) : "default";
}

export async function getCategories(locale: Locale): Promise<PublicCategory[]> {
  return getJson<PublicCategory[]>("/api/public/categories", locale);
}

/** One category with the SEO of its page; null when the slug is unknown. */
export async function getCategory(slug: string, locale: Locale): Promise<PublicCategoryDetail | null> {
  try {
    return await getJson<PublicCategoryDetail>(`/api/public/categories/${encodeURIComponent(slug)}`, locale);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export async function getProducts(q: CatalogQuery, locale: Locale): Promise<PublicProductPage> {
  const sp = catalogSearchParams({ size: PAGE_SIZE, ...q });
  return getJson<PublicProductPage>(`/api/public/products?${sp.toString()}`, locale);
}

/** null when the product does not exist (or is not public). */
export async function getProductBySlug(slug: string, locale: Locale): Promise<StorefrontProduct | null> {
  try {
    return await getJson<StorefrontProduct>(
      `/api/public/products/by-slug/${encodeURIComponent(slug)}`,
      locale,
      ["catalog", `product:${slug}`]
    );
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Slugs only — language-independent. */
export async function getSitemap(): Promise<PublicSitemap> {
  return getJson<PublicSitemap>("/api/public/sitemap", null);
}

export async function getPaymentOptions(locale: Locale): Promise<PaymentOption[]> {
  return getJson<PaymentOption[]>("/api/payment-options", locale, ["payment-options"]);
}

/** Same as the promise-returning getters, but resolves to a fallback instead of throwing. */
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[site] data fetch failed:", e);
    return fallback;
  }
}
