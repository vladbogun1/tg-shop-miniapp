/**
 * Locale routing.
 *
 *   /…        → Ukrainian (default, no prefix) — internally rewritten to /uk/…
 *   /ru/…     → Russian
 *   /en/…     → English
 *   /uk/…     → permanent redirect to the unprefixed URL (one canonical address per page)
 *
 * Everything under app/ lives in app/[locale]/…, so the rewrite is all it takes; the URL the
 * visitor sees never changes.
 */
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/uk" || pathname.startsWith("/uk/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    url.search = search;
    return NextResponse.redirect(url, 308);
  }

  if (/^\/(ru|en)(\/|$)/.test(pathname)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = `/uk${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Not: the backend (/api, /ws), images (/img), Next internals, the site's own service routes
  // (/_site), metadata files and anything with a file extension.
  matcher: [
    "/((?!api/|api$|ws|img/|_next/|_site/|_vercel|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
