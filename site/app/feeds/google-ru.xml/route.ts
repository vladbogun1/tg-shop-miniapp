/** GET /feeds/google-ru.xml — the Google feed in Russian, links to /ru/… (an optional second data source). */
import { feedResponse } from "@/lib/feed-route";
import { googleFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export function GET() {
  return feedResponse("ru", (items) => googleFeed(items, "ru"));
}
