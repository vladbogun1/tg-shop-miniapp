"use client";

/**
 * OrderCard — compact card for kanban columns / the mobile list.
 * Line 1: short id · "Сайт" · time · optional action slot (the mobile ⇄ used to sit ON the time).
 * Line 2: customer. Line 3: total · what was ordered (a strip of tiny photos in place of the old
 * «📦 3», so the card keeps its height) · delivery icon · unread. Line 4: payment state (with the
 * time left to pay online while it is due) + option
 * in one muted line (the "Нова пошта" / "Передоплата" badges repeated on every card took most of it).
 * `returning` = the card in «Едет назад»: the strip and the count show only the units on their way back.
 */
import type { CSSProperties, ReactNode } from "react";
import { Ban, Truck, Store, MessageCircle, Package2, Undo2, Repeat } from "lucide-react";
import type { AdminOrderCard, CardLine } from "@/lib/orders-api";
import { Image } from "@/lib/image";
import { ReturnBadge } from "@/components/orders/ReturnBadge";
import { money } from "@/lib/money";
import { shortId, timeAgo, DELIVERY_LABEL } from "@/lib/orders";
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { SourceBadge } from "@/components/orders/SourceBadge";
import { cn } from "@/lib/cn";

interface Props {
  order: AdminOrderCard;
  onClick?: () => void;
  /** dnd-kit dragging visual */
  dragging?: boolean;
  /** Small button in the header row (mobile "Переместить"). */
  headerAction?: ReactNode;
  /** Shown in «Едет назад»: only the units on their way back. */
  returning?: boolean;
}

/** Photos on the strip before «+N». */
const STRIP_MAX = 3;

/** Tiny overlapping photos of what was ordered; the tooltip lists every line. */
function LineStrip({ lines, units, returning }: { lines: CardLine[]; units: number; returning?: boolean }) {
  const shown = lines.slice(0, STRIP_MAX);
  const more = lines.length - shown.length;
  const tip = lines
    .map((l) => `${l.gift ? "🎁 " : ""}${l.title} ×${returning ? l.returning : l.quantity}`)
    .join("\n");
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={tip}>
      <span className="flex shrink-0 items-center">
        {shown.map((l, i) => (
          <Image
            key={i}
            src={l.imageUrl ?? undefined}
            alt={l.title}
            size={48}
            className={cn(
              "h-[22px] w-[22px] shrink-0 rounded-[5px] border border-[var(--line)] bg-[var(--surface-2)] ring-2 ring-[var(--surface)]",
              i > 0 && "-ml-1.5"
            )}
          />
        ))}
        {more > 0 && (
          <span className="tabular -ml-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-[5px] border border-[var(--line)] bg-[var(--surface-3)] px-1 text-[10px] font-semibold text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
            +{more}
          </span>
        )}
      </span>
      <span className="tabular whitespace-nowrap text-[12px] text-[var(--text-muted)]">
        {units} шт.
      </span>
    </span>
  );
}

export function OrderCard({ order, onClick, dragging, headerAction, returning }: Props) {
  const allLines = order.lines ?? [];
  const lines = returning ? allLines.filter((l) => l.returning > 0) : allLines;
  const units = returning ? order.returningUnits ?? 0 : order.itemsCount;
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
        {lines.length > 0 ? (
          <LineStrip lines={lines} units={units} returning={returning} />
        ) : (
          <span className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]" title="Единиц товара">
            <Package2 className="h-3.5 w-3.5" />
            {units}
          </span>
        )}
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

      <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="shrink-0 whitespace-nowrap">
          <PaymentBadge order={order} showTimeLeft />
        </span>
        {returning ? (
          <span
            className="chip-tint shrink-0 !gap-1 !px-1.5 !text-[10.5px]"
            style={{ "--chip": "var(--st-returning)" } as CSSProperties}
            title="Сколько единиц едет назад из всего заказа"
          >
            <Undo2 className="h-3 w-3" />
            {units === order.itemsCount ? "вся посылка" : `${units} из ${order.itemsCount}`}
          </span>
        ) : (
          <ReturnBadge status={order.returnStatus} className="shrink-0 !px-1.5 !text-[10.5px]" />
        )}
        {(order.exchangeOfId || (order.exchangeOrderIds?.length ?? 0) > 0) && (
          // Icon only: the row is full on a narrow column; the tooltip names the other order.
          <span
            className="chip-tint shrink-0 !px-1 !text-[10.5px]"
            style={{ "--chip": "var(--accent-hi)" } as CSSProperties}
            aria-label={order.exchangeOfId ? "Замена по обмену" : "Был обмен"}
            title={
              order.exchangeOfId
                ? `Замена по обмену из заказа #${shortId(order.exchangeOfId)}`
                : `Обмен: новый заказ ${order.exchangeOrderIds!.map((id) => "#" + shortId(id)).join(", ")}`
            }
          >
            <Repeat className="h-3 w-3" />
          </span>
        )}
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
