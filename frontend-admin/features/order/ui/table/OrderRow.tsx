"use client";

import { ExternalLink, MessageCircle } from "lucide-react";
import { payableMinor } from "@shop/core/orders";
import { formatDateTime } from "@shop/core/time";
import { PaymentBadge } from "@/features/payment";
import { ReturnBadge } from "@/features/returns";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { money } from "@/lib/money";
import type { AdminOrderCard } from "../../api";
import { DELIVERY_LABEL, shortId } from "../../model/status";
import { SourceBadge } from "../board/SourceBadge";

function UnreadCell({ count }: { count: number }) {
  if (count <= 0) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <Badge tone="danger">
      <MessageCircle className="h-3 w-3" />
      {count}
    </Badge>
  );
}

/** Строка десктопной таблицы заказов. */
export function OrderRow({ order: o, onOpen }: { order: AdminOrderCard; onOpen: (id: string) => void }) {
  return (
    <tr onClick={() => onOpen(o.id)} className="cursor-pointer">
      <td className="tabular whitespace-nowrap !text-[var(--text-faint)]">{formatDateTime(o.createdAt)}</td>
      <td className="font-display tabular whitespace-nowrap font-semibold tracking-[0.02em] !text-[var(--text-muted)]">{shortId(o.id)}</td>
      <td className="font-semibold">
        {/* The name never breaks; the «Сайт» chip drops under it when the column is tight. */}
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap">{o.customerName || "—"}</span>
          <SourceBadge source={o.source} />
        </span>
      </td>
      <td className="r font-display whitespace-nowrap font-bold !text-[var(--ink)]">{money(payableMinor(o), o.currency)}</td>
      <td>
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge status={o.status} />
          <ReturnBadge status={o.returnStatus} icon={false} />
        </span>
      </td>
      <td className="whitespace-nowrap !text-[var(--text-muted)]">{o.deliveryMethod ? DELIVERY_LABEL[o.deliveryMethod] : undefined}</td>
      <td className="!text-[var(--text-muted)]">{o.paymentOptionTitle || "—"}</td>
      <td className="text-center">
        <PaymentBadge order={o} icon={false} />
      </td>
      <td className="text-center">
        <UnreadCell count={o.unreadCount} />
      </td>
      <td className="r">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen(o.id);
          }}
          className="nb-press font-display inline-flex h-7 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Открыть
        </button>
      </td>
    </tr>
  );
}
