"use client";

/**
 * «Відстежити ↗» of a Nova Poshta parcel (checkout v2), the order page only. The link is shared with the site
 * (@shop/customer/order/parcel); inside Telegram it goes through openLink so the Mini App is not replaced.
 */
import { ExternalLink } from "lucide-react";
import { trackingLink } from "@shop/customer/order/parcel-tracking";
import { useOrderDeliveryT } from "@/i18n/order-delivery";
import { openExternalLink } from "@/platform/telegram";

/** «Відстежити ↗» — only when the order has a waybill number. */
export function TrackLink({ order }: { order: Parameters<typeof trackingLink>[0] }) {
  const t = useOrderDeliveryT();
  const url = trackingLink(order);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Inside Telegram a plain link would replace the Mini App: hand it to openLink.
        e.preventDefault();
        openExternalLink(url);
      }}
      className="font-display tap inline-flex min-h-8 items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent)]"
    >
      {t("parcel.track")}
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </a>
  );
}
