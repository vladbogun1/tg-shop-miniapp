/**
 * Contract of the public website (`site/`) — see docs/SITE-SPEC.md.
 *
 * Kept apart from `types.ts` so the Mini App and the admin panel do not change shape: every field
 * here is additive, and the existing `/api/products` DTOs stay exactly as they were.
 */
import type { Product, ProductTag } from "./types";

/** ProductDto as the public catalog returns it (extra fields the Mini App ignores). */
export interface StorefrontProduct extends Product {
  slug: string;
  /** Old (struck-through) price; only meaningful when greater than priceMinor. */
  compareAtMinor?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt?: string;
  /** Brand for schema.org (admin field, not translated); null = the site guesses from the texts. */
  brand?: string | null;
  /** Article number; null = the site uses the id. */
  sku?: string | null;
  tags?: StorefrontTag[];
}

export interface StorefrontTag extends ProductTag {
  slug?: string;
  sortOrder?: number;
  showInMenu?: boolean;
}

/** GET /api/public/categories */
export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  productCount: number;
}

/**
 * GET /api/public/categories/{slug} — one category with the SEO of its page in the requested
 * language. Every SEO field is optional: null = the site's template (site/lib/seo.ts).
 */
export interface PublicCategoryDetail extends PublicCategory {
  showInMenu: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Page heading; null = the category name. */
  h1?: string | null;
  /** SEO text of the category (300–600 words, plain text with line breaks). */
  introText?: string | null;
}

export type CatalogSort = "default" | "price_asc" | "price_desc" | "new" | "name";

/** GET /api/public/products */
export interface PublicProductPage {
  items: StorefrontProduct[];
  total: number;
  page: number;
  size: number;
  /** Highest price in the selection ignoring `priceMax` (for the price filter). */
  priceMaxAvailable: number;
}

/** GET /api/public/sitemap */
export interface PublicSitemap {
  products: { slug: string; updatedAt?: string | null }[];
  /** Only categories with products; `updatedAt` = newest change among them. */
  categories: { slug: string; updatedAt?: string | null }[];
}

// ---- web login through the bot ---------------------------------------------

/** POST /api/auth/web/start */
export interface WebLoginStart {
  loginId: string;
  deepLink: string;
  matchCode: number;
  expiresAt: string;
}

export type WebLoginStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED" | "USED";

/** GET /api/me/sessions */
export interface WebSession {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
  current: boolean;
}
