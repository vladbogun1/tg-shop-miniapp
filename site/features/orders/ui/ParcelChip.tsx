"use client";

/**
 * Посылка «Нової пошти» в заказе (checkout v2): стадия («В дорозі», «Прибула — можна забирати», …), текст статуса НП
 * и «Відстежити» на novaposhta.ua в новой вкладке. Стадия, тон и ссылка — общие с Mini App (@shop/customer/order/parcel).
 */
import { ExternalLink } from "lucide-react";
import type { ShipmentStage } from "@shop/customer/delivery/contract";
import { tint } from "@shop/ui/tint";
import { PARCEL_TONE_COLOR, parcelStageKey, parcelStageOf, parcelTone, trackingLink } from "@shop/customer/order/parcel";
import { useI18n } from "@/i18n/context";

export function ParcelChip({ stage }: { stage: ShipmentStage }) {
  const { t } = useI18n();
  const color = PARCEL_TONE_COLOR[parcelTone(stage)];
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[.06em]"
      style={{ background: tint(color, 16), color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 break-words">{t(parcelStageKey(stage))}</span>
    </span>
  );
}

/** «Відстежити ↗» — только при номере ТТН. */
export function TrackLink({ order }: { order: Parameters<typeof trackingLink>[0] }) {
  const { t } = useI18n();
  const url = trackingLink(order);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)] hover:underline"
    >
      {t("parcel.track")}
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </a>
  );
}

/** Стадия + «Відстежити» + текст статуса НП под номером ТТН. Без посылки — ничего. */
export function ParcelStatus({ order }: { order: Parameters<typeof trackingLink>[0] & { shipmentStage?: string | null; shipment?: { stage?: string | null; statusText?: string | null } | null } }) {
  const stage = parcelStageOf(order);
  const statusText = order.shipment?.statusText;
  if (!order.trackingNumber && !order.shipment) return null;
  return (
    <span className="mt-2 flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        {stage && <ParcelChip stage={stage} />}
        <TrackLink order={order} />
      </span>
      {statusText && <span className="text-[13px] font-medium text-[var(--muted)]">{statusText}</span>}
    </span>
  );
}

/** Стадия посылки в списке заказов (без ссылки: строка сама ссылка). До ТТН — ничего. */
export function ParcelStage({ order }: { order: Parameters<typeof parcelStageOf>[0] & { trackingNumber?: string | null } }) {
  const stage = parcelStageOf(order);
  return stage && order.trackingNumber ? <ParcelChip stage={stage} /> : null;
}
