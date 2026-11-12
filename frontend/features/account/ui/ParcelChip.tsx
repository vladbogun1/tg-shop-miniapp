"use client";

/**
 * Nova Poshta parcel stage chip (checkout v2) — the order list and the order page. Stage and tone are shared with the
 * site (@shop/customer/order/parcel); the pill is the order StatusChip with the stage colour.
 * «Відстежити» lives in TrackLink.tsx: the list does not need it (bundle).
 */
import type { ShipmentStage } from "@shop/customer/delivery/contract";
import { StatusChip } from "@shop/ui/primitives";
import { parcelStageColor, parcelStageKey, parcelStageOf } from "@shop/customer/order/parcel";
import { useT } from "@/i18n/context";

export function ParcelChip({ stage }: { stage: ShipmentStage }) {
  const t = useT();
  return <StatusChip color={parcelStageColor(stage)} label={t(parcelStageKey(stage))} />;
}

/** The parcel stage of a listed order as a chip, nothing before the waybill. */
export function ParcelStage({ order }: { order: Parameters<typeof parcelStageOf>[0] & { trackingNumber?: string | null } }) {
  const stage = parcelStageOf(order);
  return stage && order.trackingNumber ? <ParcelChip stage={stage} /> : null;
}
