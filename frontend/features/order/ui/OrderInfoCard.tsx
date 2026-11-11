"use client";

import { motion } from "framer-motion";
import { CreditCard, MapPin, Receipt, Store } from "lucide-react";
import { codAmountMinor, onDeliveryUnpaid, orderCourierAddress, orderRecipientName } from "@shop/customer/order/np-order";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { money } from "@/lib/money";
import { riseItem } from "@/lib/motion";

/** Recipient, delivery (point or courier address), payment option (+ what is paid to NP on receipt), comment. */
export function OrderInfoCard({ order }: { order: OrderDetail }) {
  const t = useT();
  const isPickup = order.deliveryMethod === "PICKUP";
  const place = orderCourierAddress(order) || order.npWarehouseName;
  return (
        <motion.section
          variants={riseItem}
          className="nb flex flex-col gap-4 p-4"
        >
          <InfoRow
            icon={<Receipt className="h-4 w-4" strokeWidth={2.5} />}
            label={t("order.recipient")}
            value={`${orderRecipientName(order)}, ${order.phone}`}
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
                : t("order.npDelivery", { city: order.npCityName ?? "" }) + (place ? `, ${place}` : "")
            }
          />
          {(order.paymentOptionTitle || order.exchangeOfId) && (
            <InfoRow
              icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
              label={t("order.payment")}
              value={order.exchangeOfId ? t("pay.exchangeMethod") : order.paymentOptionTitle!}
            />
          )}
          {onDeliveryUnpaid(order) && (
            <p className="-mt-2 pl-7 text-[13px] font-semibold text-[var(--muted)]">
              {t("parcel.cod", { amount: money(codAmountMinor(order), order.currency) })}
            </p>
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
