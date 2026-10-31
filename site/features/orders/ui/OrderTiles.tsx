"use client";

import { CreditCard, MapPin, Store, Truck } from "lucide-react";
import { payableMinor } from "@shop/core/orders";
import { type OrderDetail } from "@shop/core/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { useI18n } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";

/** Delivery / payment / address tiles of the order page. */
export function OrderTiles({ order, uncollected }: { order: OrderDetail; uncollected: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const isPickup = order.deliveryMethod === "PICKUP";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
      <Tile icon={isPickup ? <Store className="h-5 w-5" /> : <Truck className="h-5 w-5" />} label={t("order.delivery")}>
        {isPickup ? t("order.pickup") : t("order.np")}
        {order.trackingNumber && (
          <span className="mt-2 flex items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--muted)]">{t("order.tracking")}</span>
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-[.04em] text-[var(--accent-hi)]">{order.trackingNumber}</span>
            <CopyButton value={order.trackingNumber} label={t("order.tracking")} />
          </span>
        )}
      </Tile>
      <Tile icon={<CreditCard className="h-5 w-5" />} label={t("order.payment")}>
        {order.exchangeOfId ? t("pay.exchangeMethod") : order.paymentOptionTitle ?? "—"}
        <span className="mt-1 block text-[13px] font-semibold text-[var(--muted)]">
          {uncollected > 0 ? t("order.payable") : t("order.total")}: {fmt.money(payableMinor(order), order.currency)}
        </span>
      </Tile>
      <Tile icon={<MapPin className="h-5 w-5" />} label={t("order.address")}>
        {isPickup ? t("order.pickup") : [order.npCityName, order.npWarehouseName].filter(Boolean).join(", ") || "—"}
        <span className="mt-1 block text-[13px] font-semibold text-[var(--muted)]">
          {order.customerName}, {order.phone}
        </span>
      </Tile>
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="nb p-4">
      <p className="eyebrow mb-2 flex items-center gap-2 text-[11px]">
        <span className="text-[var(--accent)]">{icon}</span> {label}
      </p>
      <div className="break-words text-[15px] font-semibold text-[var(--ink)]">{children}</div>
    </div>
  );
}
