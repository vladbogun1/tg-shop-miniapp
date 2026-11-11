"use client";

/**
 * Nova Poshta parcel stage chip and «Відстежити» (checkout v2) — the order list and the order page. Stage, tone and
 * the link are shared with the site (@shop/customer/order/parcel); the link goes through Telegram openLink so the
 * Mini App is not replaced.
 */
import { ExternalLink } from "lucide-react";
import type { ShipmentStage } from "@shop/customer/delivery/contract";
import { tint } from "@shop/ui/tint";
import { PARCEL_TONE_COLOR, parcelStageKey, parcelStageOf, parcelTone, trackingLink } from "@shop/customer/order/parcel";
import { useT } from "@/i18n/context";
import { openExternalLink } from "@/platform/telegram";

export function ParcelChip({ stage }: { stage: ShipmentStage }) {
  const t = useT();
  const color = PARCEL_TONE_COLOR[parcelTone(stage)];
  return (
    <span
      className="font-display inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: tint(color, 16), color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 break-words">{t(parcelStageKey(stage))}</span>
    </span>
  );
}

/** «Відстежити ↗» — only when the order has a waybill number. */
export function TrackLink({ order }: { order: Parameters<typeof trackingLink>[0] }) {
  const t = useT();
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

/** The parcel stage of a listed order as a chip, nothing before the waybill. */
export function ParcelStage({ order }: { order: Parameters<typeof parcelStageOf>[0] & { trackingNumber?: string | null } }) {
  const stage = parcelStageOf(order);
  return stage && order.trackingNumber ? <ParcelChip stage={stage} /> : null;
}
