"use client";

import { motion } from "framer-motion";
import { Check, Copy, Truck } from "lucide-react";
import { useState } from "react";
import type { paymentState } from "@shop/core/orders";
import { PaymentBadge } from "@/components/account/PaymentBadge";
import { StatusTimeline } from "@/components/account/StatusTimeline";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { riseItem } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

/** Status + timeline, the reject reason, the tracking number and the creation time. */
export function OrderStatusCard({
  order,
  payState,
  paymentTimeout,
}: {
  order: OrderDetail;
  payState: ReturnType<typeof paymentState>;
  paymentTimeout: boolean;
}) {
  const t = useT();
  return (
        <motion.section variants={riseItem} className="nb p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">
              {t("order.status")}
            </h3>
            <PaymentBadge state={payState} />
          </div>
          <StatusTimeline status={order.status} />

          {paymentTimeout ? (
            <div className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[13px] font-bold text-[var(--danger)]">{t("pay.timeout")}</p>
            </div>
          ) : order.status === "REJECTED" && order.rejectReason && (
            <div className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[11px] font-bold text-[var(--danger)]">
                {t("order.rejectReason")}
              </p>
              <p className="mt-1 text-[14px] text-[var(--ink)]">
                {order.rejectReason}
              </p>
            </div>
          )}

          {order.trackingNumber && (
            <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
              <Truck
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
                strokeWidth={2.5}
              />
              <span className="nb-up text-[11px] font-semibold text-[var(--muted)]">
                {t("order.tracking")}
              </span>
              <span className="font-display min-w-0 flex-1 truncate text-[14px] font-bold tabular-nums text-[var(--ink)]">
                {order.trackingNumber}
              </span>
              <CopyButton value={order.trackingNumber} label={t("order.tracking")} />
            </div>
          )}

          <p className="mt-3 text-[12px] text-[var(--faint)]">
            {t("order.createdAt", { when: formatDateTime(order.createdAt) })}
          </p>
        </motion.section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    haptic();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={t("order.copy", { label })}
      className="tap nb-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
      ) : (
        <Copy className="h-4 w-4 text-[var(--muted)]" strokeWidth={2.5} />
      )}
    </button>
  );
}
