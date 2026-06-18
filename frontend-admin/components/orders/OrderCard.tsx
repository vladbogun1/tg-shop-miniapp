"use client";

/**
 * OrderCard — compact glass card shown in kanban columns / mobile list.
 * Shows: short id, customer, total, itemsCount, delivery badge, payment badge,
 * unread chat badge, time (design doc §6ter.1).
 */
import { Truck, Store, CreditCard, MessageCircle, Package2 } from "lucide-react";
import type { OrderCardDto } from "@/lib/api";
import { money } from "@/lib/money";
import { shortId, timeAgo, DELIVERY_LABEL } from "@/lib/orders";
import { Badge } from "@/components/ui/Badge";

interface Props {
  order: OrderCardDto;
  onClick?: () => void;
  /** dnd-kit dragging visual */
  dragging?: boolean;
}

export function OrderCard({ order, onClick, dragging }: Props) {
  return (
    <div
      onClick={onClick}
      className={`glass cursor-pointer rounded-[var(--r-md)] p-3 transition-shadow ${
        dragging ? "opacity-60 shadow-[var(--shadow-2)]" : "hover:shadow-[var(--shadow-2)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[12px] text-[var(--text-muted)]">
          {shortId(order.id)}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]">
          {timeAgo(order.createdAt)}
        </span>
      </div>

      <div className="mt-1 truncate text-[14px] font-semibold text-[var(--text)]">
        {order.customerName || "Без имени"}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[15px] font-bold text-[var(--text)]">
          {money(order.totalMinor, order.currency)}
        </span>
        <span className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
          <Package2 className="h-3.5 w-3.5" />
          {order.itemsCount}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge
          icon={
            order.deliveryMethod === "NOVA_POSHTA" ? (
              <Truck className="h-3 w-3" />
            ) : (
              <Store className="h-3 w-3" />
            )
          }
        >
          {DELIVERY_LABEL[order.deliveryMethod]}
        </Badge>
        {order.paymentOptionTitle && (
          <Badge icon={<CreditCard className="h-3 w-3" />}>
            {order.paymentOptionTitle}
          </Badge>
        )}
        {order.unreadCount > 0 && (
          <Badge color="var(--danger)" icon={<MessageCircle className="h-3 w-3" />}>
            {order.unreadCount}
          </Badge>
        )}
      </div>
    </div>
  );
}
