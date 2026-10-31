/** GET /feeds/google-ru.xml — the Google feed in Russian, links to /ru/… (an optional second data source). */
import { feedResponse } from "@/features/feeds/server";
import { googleFeed } from "@/features/feeds/server";

export const dynamic = "force-dynamic";

export function GET() {
  return feedResponse("ru", (items) => googleFeed(items, "ru"));
}
