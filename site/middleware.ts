/**
 * Locale routing.
 *
 *   /…        → Ukrainian (default, no prefix) — rewritten to /uk/… by next.config.ts, NOT here:
 *               a middleware rewrite turns ISR off for the page (see the comment there)
 *   /ru/…     → Russian
 *   /en/…     → English
 *   /uk/…     → permanent redirect to the unprefixed URL (one canonical address per page)
 *
 * So the middleware only redirects, and only runs for /uk… and product/category paths — plus, until
 * the end of Halloween 2026, swaps the mascot/case pictures for their Halloween versions.
 */
import { NextResponse, type NextRequest } from "next/server";
import { HW_SITE_ASSETS, isHalloween } from "@shop/shared/event";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Halloween 2026: the same mascot/case pictures, redrawn, under public/mascot-hw and public/case-hw.
  if (/^\/(mascot|case)\//.test(pathname)) {
    // Only the pictures that were redrawn (list: events/halloween/tools/hw-manifest.mjs).
    if (!isHalloween() || !HW_SITE_ASSETS.has(pathname)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/(mascot|case)\//, "/$1-hw/");
    return NextResponse.rewrite(url);
  }

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/mascot/:path*",
    "/case/:path*",
    "/uk",
    "/uk/:path*",
    "/product/:path*",
    "/catalog/:path*",
    "/ru/product/:path*",
    "/ru/catalog/:path*",
    "/en/product/:path*",
    "/en/catalog/:path*",
  ],
};
