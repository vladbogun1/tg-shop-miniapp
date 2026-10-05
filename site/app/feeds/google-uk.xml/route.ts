/** GET /feeds/google-uk.xml — the same feed as /feeds/google.xml, under the name docs/SEO-GROWTH-GUIDE.md uses. */
import { feedResponse } from "@/lib/feed-route";
import { googleFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export function GET() {
  return feedResponse("uk", (items) => googleFeed(items, "uk"));
}
