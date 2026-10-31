"use client";

import { motion } from "framer-motion";
import { CreditCard, MapPin, Receipt, Store } from "lucide-react";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { riseItem } from "@/lib/motion";

/** Recipient, delivery, payment option, comment. */
export function OrderInfoCard({ order }: { order: OrderDetail }) {
  const t = useT();
  const isPickup = order.deliveryMethod === "PICKUP";
  return (
        <motion.section
          variants={riseItem}
          className="nb flex flex-col gap-4 p-4"
        >
          <InfoRow
            icon={<Receipt className="h-4 w-4" strokeWidth={2.5} />}
            label={t("order.recipient")}
            value={`${order.customerName}, ${order.phone}`}
          />
          <InfoRow
            icon={
              isPickup ? (
                <Store className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <MapPin className="h-4 w-4" strokeWidth={2.5} />
              )
            }
            label={t("order.delivery")}
            value={
              isPickup
                ? t("order.pickup")
                : t("order.npDelivery", { city: order.npCityName ?? "" }) +
                  (order.npWarehouseName ? `, ${order.npWarehouseName}` : "")
            }
          />
          {(order.paymentOptionTitle || order.exchangeOfId) && (
            <InfoRow
              icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
              label={t("order.payment")}
              value={order.exchangeOfId ? t("pay.exchangeMethod") : order.paymentOptionTitle!}
            />
          )}
          {order.comment && (
            <InfoRow label={t("order.comment")} value={order.comment} />
          )}
        </motion.section>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {icon && (
        <span className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {label}
        </span>
        <span className="break-words text-[14px] text-[var(--ink)]">
          {value}
        </span>
      </div>
    </div>
  );
}
