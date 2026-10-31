/** GET /feeds/google.xml — Google Merchant Center product feed, Ukrainian (see lib/feeds.ts). */
import { feedResponse } from "@/features/feeds/server";
import { googleFeed } from "@/features/feeds/server";

// Built per request from the backend (the build has none); the product data is cached for an hour.
export const dynamic = "force-dynamic";

export function GET() {
  return feedResponse("uk", (items) => googleFeed(items, "uk"));
}
