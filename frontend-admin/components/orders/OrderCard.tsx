"use client";

/**
 * OrderCard — compact card for kanban columns / the mobile list.
 * Line 1: short id · "Сайт" · time · optional action slot (the mobile ⇄ used to sit ON the time).
 * Line 2: customer. Line 3: total · units · delivery icon · unread. Line 4: payment state + option
 * in one muted line (the "Нова пошта" / "Передоплата" badges repeated on every card took most of it).
 */
import type { ReactNode } from "react";
import { Truck, Store, MessageCircle, Package2 } from "lucide-react";
import type { OrderCardDto } from "@/lib/api";
import { money } from "@/lib/money";
import { shortId, timeAgo, DELIVERY_LABEL } from "@/lib/orders";
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { SourceBadge } from "@/components/orders/SourceBadge";
import { cn } from "@/lib/cn";

interface Props {
  order: OrderCardDto;
  onClick?: () => void;
  /** dnd-kit dragging visual */
  dragging?: boolean;
  /** Small button in the header row (mobile "Переместить"). */
  headerAction?: ReactNode;
}

export function OrderCard({ order, onClick, dragging, headerAction }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "card nb-press cursor-pointer p-3",
        dragging
          ? "rotate-[1.5deg] opacity-95 shadow-[var(--shadow-3)]"
          : "transition-shadow hover:-translate-x-px hover:-translate-y-px hover:shadow-[var(--shadow-2)] hover:border-[var(--border-strong)]"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-bold text-[var(--text-muted)]">{shortId(order.id)}</span>
        <SourceBadge source={order.source} className="px-1.5 py-0 text-[10px]" />
        <span className="ml-auto text-[11px] text-[var(--text-faint)]">{timeAgo(order.createdAt)}</span>
        {headerAction}
      </div>

      <div className="mt-1 truncate text-[14px] font-extrabold text-[var(--text)]">
        {order.customerName || "Без имени"}
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="text-[16px] font-black text-[var(--text)]">{money(order.totalMinor, order.currency)}</span>
        <span className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]" title="Единиц товара">
          <Package2 className="h-3.5 w-3.5" />
          {order.itemsCount}
        </span>
        <span className="text-[var(--text-muted)]" title={DELIVERY_LABEL[order.deliveryMethod]}>
          {order.deliveryMethod === "NOVA_POSHTA" ? <Truck className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
        </span>
        {order.unreadCount > 0 && (
          <span
            className="ml-auto flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--danger)] px-1.5 text-[11px] font-black text-[var(--accent-ink)]"
            title="Непрочитанные сообщения"
          >
            <MessageCircle className="h-3 w-3" />
            {order.unreadCount}
          </span>
        )}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <PaymentBadge order={order} />
        {order.paymentOptionTitle && (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-faint)]">{order.paymentOptionTitle}</span>
        )}
      </div>
    </div>
  );
}
