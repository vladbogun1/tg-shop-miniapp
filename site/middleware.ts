/**
 * Locale routing.
 *
 *   /…        → Ukrainian (default, no prefix) — rewritten to /uk/… by next.config.ts, NOT here:
 *               a middleware rewrite turns ISR off for the page (see the comment there)
 *   /ru/…     → Russian
 *   /en/…     → English
 *   /uk/…     → permanent redirect to the unprefixed URL (one canonical address per page)
 *
 * So the middleware only redirects, and only runs for /uk… and product/category paths.
 *
 * It also answers an OLD brand slug (`/catalog?brand=<old>`, a renamed brand) with a 301 to the new one.
 * That asks the backend, so it happens only when the URL carries `brand` — never on a plain page view.
 */
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout } from "@shop/core/fetch-timeout";
import { brandSlugsOf, isBrandFilterPath, rewriteBrandParam } from "@/features/catalog/model/brand-redirect";

/** A slow backend must not hold a page view: no answer in time = no redirect (the page still renders). */
const BRAND_LOOKUP_TIMEOUT_MS = 1_500;

/** Old slug → current slug for the brands in the URL; empty on any failure (fail open). */
async function currentBrandSlugs(slugs: string[]): Promise<Record<string, string>> {
  const base = (process.env.INTERNAL_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
  try {
    const { res, done } = await fetchWithTimeout(
      `${base}/api/public/brands/redirects?slugs=${encodeURIComponent(slugs.join(","))}`,
      { headers: { Accept: "application/json" } },
      BRAND_LOOKUP_TIMEOUT_MS
    );
    try {
      return res.ok ? ((await res.json()) as Record<string, string>) : {};
    } finally {
      done();
    }
  } catch {
    return {};
  }
}

async function brandRedirect(req: NextRequest): Promise<NextResponse | null> {
  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandFilterPath(req.nextUrl.pathname)) return null;
  const slugs = brandSlugsOf(brand);
  if (slugs.length === 0) return null;
  const next = rewriteBrandParam(brand, await currentBrandSlugs(slugs));
  if (next === null) return null;
  const sp = new URLSearchParams(req.nextUrl.search);
  sp.set("brand", next);
  const url = req.nextUrl.clone();
  url.search = `?${sp.toString().replace(/%2C/gi, ",")}`;
  return NextResponse.redirect(url, 301);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/uk" || pathname.startsWith("/uk/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    url.search = search;
    return NextResponse.redirect(url, 308);
  }

  // Slugs are lower case and the API matches them case-insensitively, so /product/ATTACK-Shark
  // answered 200 with the same page. One address per page: a real 301 to the lower-case path.
  // (Percent-escapes like %D0 are left alone — their hex case means nothing.)
  if (/^(?:\/(?:ru|en))?\/(?:product|catalog)\/[^/]*[A-Z]/.test(pathname.replace(/%[0-9a-fA-F]{2}/g, ""))) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/%[0-9a-fA-F]{2}|[A-Z]+/g, (m) => (m.startsWith("%") ? m : m.toLowerCase()));
    url.search = search;
    return NextResponse.redirect(url, 301);
  }

  return (await brandRedirect(req)) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/uk",
    "/uk/:path*",
    "/product/:path*",
    "/catalog/:path*",
    "/ru/product/:path*",
    "/ru/catalog/:path*",
    "/en/product/:path*",
    "/en/catalog/:path*",
    "/search",
    "/ru/search",
    "/en/search",
  ],
};
