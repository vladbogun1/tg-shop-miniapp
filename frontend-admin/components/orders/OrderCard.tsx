"use client";

/**
 * OrderCard — compact card for kanban columns / the mobile list.
 * Line 1: short id · "Сайт" · time · optional action slot (the mobile ⇄ used to sit ON the time).
 * Line 2: customer. Line 3: total · units · delivery icon · unread. Line 4: payment state (with the
 * time left to pay online while it is due) + option
 * in one muted line (the "Нова пошта" / "Передоплата" badges repeated on every card took most of it).
 */
import type { CSSProperties, ReactNode } from "react";
import { Ban, Truck, Store, MessageCircle, Package2 } from "lucide-react";
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
        "card card-hover nb-press cursor-pointer p-3",
        dragging && "rotate-[1.5deg] border-[var(--line-strong)] opacity-95 shadow-[var(--shadow-3)]"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-display tabular text-[12px] font-semibold tracking-[0.02em] text-[var(--text-muted)]">{shortId(order.id)}</span>
        <SourceBadge source={order.source} className="!px-1.5 !text-[10px] !leading-4" />
        <span className="ml-auto whitespace-nowrap text-[11px] text-[var(--text-faint)]">{timeAgo(order.createdAt)}</span>
        {headerAction}
      </div>

      <div className="mt-1 truncate text-[14px] font-semibold text-[var(--text)]">
        {order.customerName || "Без имени"}
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="font-display tabular text-[16px] font-bold text-[var(--ink)]">{money(order.totalMinor, order.currency)}</span>
        <span className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]" title="Единиц товара">
          <Package2 className="h-3.5 w-3.5" />
          {order.itemsCount}
        </span>
        <span className="text-[var(--text-muted)]" title={DELIVERY_LABEL[order.deliveryMethod]}>
          {order.deliveryMethod === "NOVA_POSHTA" ? <Truck className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
        </span>
        {order.unreadCount > 0 && (
          <span
            className="chip-tint ml-auto !gap-1 !px-1.5"
            style={{ "--chip": "#F87171" } as CSSProperties}
            title="Непрочитанные сообщения"
          >
            <MessageCircle className="h-3 w-3" />
            {order.unreadCount}
          </span>
        )}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 whitespace-nowrap">
          <PaymentBadge order={order} showTimeLeft />
        </span>
        {order.cancelRequestStatus === "PENDING" && (
          <span
            className="chip-tint shrink-0 !gap-1 !px-1.5 !text-[10.5px]"
            style={{ "--chip": "#FBBF24" } as CSSProperties}
            title="Покупатель просит отменить оплаченный заказ"
          >
            <Ban className="h-3 w-3" />
            Отмена?
          </span>
        )}
        {order.paymentOptionTitle && (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-faint)]">{order.paymentOptionTitle}</span>
        )}
      </div>
    </div>
  );
}
