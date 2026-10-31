"use client";

import { motion } from "framer-motion";
import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { payableMinor, paymentState } from "@shop/core/orders";
import { StatusChip } from "@shop/ui/primitives";
import { PaymentBadge } from "@/features/account/ui/PaymentBadge";
import { useT } from "@/i18n/context";
import type { OrderSummary } from "@/lib/api";
import { formatDate, shortOrderId } from "@/lib/format";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic } from "@/platform/telegram";

/** "Case is waiting" / "waiting for payment" badge of a sealed gift case. */
function CaseBadge({ order }: { order: OrderSummary }) {
  const t = useT();
  if (order.giftCaseStatus !== "SEALED" || order.status === "REJECTED") return null;
  return order.giftCaseOpenable ? (
    <span className="font-display rounded-full border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] shadow-[0_0_10px_rgba(255,102,0,.35)]">
      {t("case.waiting")}
    </span>
  ) : (
    <span className="font-display rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
      {t("case.waitingPay")}
    </span>
  );
}

/** Unread-messages counter of the order chat. */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="font-display flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.5)]">
      <MessageCircle className="h-3 w-3" strokeWidth={2.75} />
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function OrderCard({ order, index }: { order: OrderSummary; index: number }) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.05 }}
    >
      <Link
        href={`/account/orders/${order.id}`}
        onClick={() => haptic()}
        className="nb nb-press tap flex items-center gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] font-bold text-[var(--ink)]">{shortOrderId(order.id)}</span>
            <StatusChip status={order.status} label={t(`status.${order.status}`)} />
            <PaymentBadge state={paymentState(order)} size="sm" />
            <CaseBadge order={order} />
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            {formatDate(order.createdAt)} · {t("account.itemsCount", { n: order.itemsCount })}
          </p>
          <span className="font-display mt-1.5 inline-block text-[17px] font-bold tabular-nums text-[var(--ink)]">
            {money(payableMinor(order), order.currency)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <UnreadBadge count={order.unreadCount} />
          <ChevronRight className="h-5 w-5 text-[var(--faint)]" strokeWidth={2.25} />
        </div>
      </Link>
    </motion.div>
  );
}
