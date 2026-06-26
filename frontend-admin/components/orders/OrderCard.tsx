"use client";

/**
 * OrderCard — compact card shown in kanban columns / mobile list / table cards.
 * Shows: short id, customer, total, itemsCount, delivery badge, payment badge,
 * unread chat badge, time. Neo `.card` surface with `nb-press` press-into-shadow.
 */
import { motion } from "framer-motion";
import {
  Truck,
  Store,
  CreditCard,
  MessageCircle,
  Package2,
  Wallet,
} from "lucide-react";
import type { OrderCardDto } from "@/lib/api";
import { money } from "@/lib/money";
import { shortId, timeAgo, DELIVERY_LABEL } from "@/lib/orders";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

interface Props {
  order: OrderCardDto;
  onClick?: () => void;
  /** dnd-kit dragging visual */
  dragging?: boolean;
}

export function OrderCard({ order, onClick, dragging }: Props) {
  return (
    <motion.div
      onClick={onClick}
      className={cn(
        "card nb-press cursor-pointer p-3.5",
        dragging
          ? "rotate-[1.5deg] opacity-95 shadow-[var(--shadow-3)]"
          : "transition-shadow hover:-translate-x-px hover:-translate-y-px hover:shadow-[var(--shadow-2)] hover:border-[var(--border-strong)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[12px] font-bold text-[var(--text-muted)]">
          {shortId(order.id)}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]">
          {timeAgo(order.createdAt)}
        </span>
      </div>

      <div className="mt-1.5 truncate text-[14px] font-extrabold text-[var(--text)]">
        {order.customerName || "Без имени"}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[17px] font-black text-[var(--text)]">
          {money(order.totalMinor, order.currency)}
        </span>
        <span className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
          <Package2 className="h-3.5 w-3.5" />
          {order.itemsCount}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={order.paid ? "ok" : "warn"}>
          <Wallet className="h-3 w-3" />
          {order.paid ? "Оплачен" : "Не оплачен"}
        </Badge>
        <Badge tone="neutral">
          {order.deliveryMethod === "NOVA_POSHTA" ? (
            <Truck className="h-3 w-3" />
          ) : (
            <Store className="h-3 w-3" />
          )}
          {DELIVERY_LABEL[order.deliveryMethod]}
        </Badge>
        {order.paymentOptionTitle && (
          <Badge tone="neutral">
            <CreditCard className="h-3 w-3" />
            {order.paymentOptionTitle}
          </Badge>
        )}
        {order.unreadCount > 0 && (
          <Badge tone="danger">
            <MessageCircle className="h-3 w-3" />
            {order.unreadCount}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}
