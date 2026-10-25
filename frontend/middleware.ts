/**
 * Halloween 2026: the gift-case pictures are served from public/case-hw (the same files, redrawn)
 * until the event ends; after that this does nothing and can be deleted with the event.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isHalloween } from "@shop/shared/event";

export function middleware(req: NextRequest) {
  if (!isHalloween()) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = url.pathname.replace(/^\/case\//, "/case-hw/");
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/case/:path*"] };
