"use client";

/**
 * Nova Poshta parcel stage chip (checkout v2) — the order list and the order page. Stage and tone are shared with the
 * site (@shop/customer/order/parcel). «Відстежити» lives in TrackLink.tsx: the list does not need it (bundle).
 */
import type { ShipmentStage } from "@shop/customer/delivery/contract";
import { tint } from "@shop/ui/tint";
import { PARCEL_TONE_COLOR, parcelStageKey, parcelStageOf, parcelTone } from "@shop/customer/order/parcel";
import { useT } from "@/i18n/context";

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

/** The parcel stage of a listed order as a chip, nothing before the waybill. */
export function ParcelStage({ order }: { order: Parameters<typeof parcelStageOf>[0] & { trackingNumber?: string | null } }) {
  const stage = parcelStageOf(order);
  return stage && order.trackingNumber ? <ParcelChip stage={stage} /> : null;
}
