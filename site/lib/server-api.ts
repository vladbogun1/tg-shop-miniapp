/**
 * Server-side data access for server components (SSR/ISR).
 *
 * Talks to the backend directly over the internal network (`INTERNAL_API_BASE`, e.g.
 * `http://backend:8080` in docker) with Next's data cache: every response is cached for
 * {@link REVALIDATE_SECONDS} and tagged, so `/_site/revalidate` can drop it early after an admin edit.
 */
import type {
  CatalogSort,
  PaymentOption,
  PublicCategory,
  PublicProductPage,
  PublicSitemap,
  StorefrontProduct,
} from "@shop/shared";
import { catalogSearchParams, type CatalogQuery } from "./api";
import { PAGE_SIZE, REVALIDATE_SECONDS } from "./config";

function apiBase(): string {
  return (process.env.INTERNAL_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
}

export class NotFoundError extends Error {}

async function getJson<T>(path: string, tags: string[] = ["catalog"]): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Accept: "application/json" },
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

export async function getCategories(): Promise<PublicCategory[]> {
  return getJson<PublicCategory[]>("/api/public/categories");
}

export async function getProducts(q: CatalogQuery): Promise<PublicProductPage> {
  const sp = catalogSearchParams({ size: PAGE_SIZE, ...q });
  return getJson<PublicProductPage>(`/api/public/products?${sp.toString()}`);
}

/** null when the product does not exist (or is not public). */
export async function getProductBySlug(slug: string): Promise<StorefrontProduct | null> {
  try {
    return await getJson<StorefrontProduct>(
      `/api/public/products/by-slug/${encodeURIComponent(slug)}`,
      ["catalog", `product:${slug}`]
    );
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export async function getSitemap(): Promise<PublicSitemap> {
  return getJson<PublicSitemap>("/api/public/sitemap");
}

export async function getPaymentOptions(): Promise<PaymentOption[]> {
  return getJson<PaymentOption[]>("/api/payment-options", ["payment-options"]);
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
