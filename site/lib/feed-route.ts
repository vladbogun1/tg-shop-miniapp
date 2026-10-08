import { FEED_REVALIDATE_SECONDS, feedItems, xmlResponse, type FeedItem } from "./feeds";
import type { Locale } from "@shop/shared";
import { loadSchema } from "./catalog";
import { getAllProducts } from "./server-api";

/**
 * GET handler body shared by the feed routes. A backend failure answers 503, never an empty feed:
 * Merchant Center / Hotline would read an empty file as "every product is gone" and delist them,
 * while a 503 makes them retry and keep the last good copy.
 */
export async function feedResponse(locale: Locale, render: (items: FeedItem[]) => string): Promise<Response> {
  try {
    const [products, schema] = await Promise.all([
      getAllProducts(locale, FEED_REVALIDATE_SECONDS),
      // Never throws: an older backend gets a schema from the menu (no characteristics).
      loadSchema(locale),
    ]);
    const items = feedItems(products, schema, locale);
    // Nothing exportable while the catalog has products means something is off — do not publish it.
    if (items.length === 0 && products.length > 0) throw new Error("no exportable products");
    return xmlResponse(render(items));
  } catch (e) {
    console.error("[site] feed build failed:", e);
    return new Response("Feed temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "600", "Cache-Control": "no-store" },
    });
  }
}
