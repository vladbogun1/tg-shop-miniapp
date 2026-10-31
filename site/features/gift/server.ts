import "server-only";
import type { Locale } from "@shop/core/i18n";
import type { GiftResponse } from "@shop/core/giftcase";
import { getJson } from "@/lib/server-http";

/**
 * What the shop gives for the order sum now — the live part of the promotion rules page (thresholds,
 * gifts in stock; never the chances). Short cache: the admin's edits do not revalidate the site.
 */
export async function getGift(locale: Locale): Promise<GiftResponse> {
  return getJson<GiftResponse>("/api/public/gift", locale, ["catalog", "gift"], 300);
}
