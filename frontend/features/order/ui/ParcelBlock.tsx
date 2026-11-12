"use client";

/** Nova Poshta parcel on the order page (checkout v2): stage chip, «Відстежити» and NP's own status line. */
import { ParcelChip, TrackLink } from "@/features/account";
import { parcelStageOf } from "@shop/customer/order/parcel";
import { useOrderDeliveryT } from "@/i18n/order-delivery";
import type { OrderDetail } from "@/lib/api";

/** Stage chip + NP's status text + «Відстежити», under the waybill number. Nothing without a parcel. */
export function ParcelStatus({ order }: { order: OrderDetail }) {
  const t = useOrderDeliveryT();
  const stage = parcelStageOf(order);
  const statusText = order.shipment?.statusText;
  if (!order.trackingNumber && !order.shipment) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{t("parcel.title")}</span>
      <div className="flex flex-wrap items-center gap-2">
        {stage && <ParcelChip stage={stage} />}
        <TrackLink order={order} />
      </div>
      {statusText && <p className="break-words text-[12px] font-medium text-[var(--muted)]">{statusText}</p>}
    </div>
  );
}
