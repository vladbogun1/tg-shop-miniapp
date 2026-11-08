"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { shortOrderId as shortId } from "@shop/core/format";
import { STATUS_COLUMN_LABEL as STATUS_LABEL } from "@shop/core/orders";
import { Badge } from "@/components/ui/Badge";
import { CASE_TIER_LABEL, GIFT_SOURCE_LABEL } from "../../model/labels";
import type { GiftRegistryRow } from "../../model/types";

export function HandedOver({ r }: { r: GiftRegistryRow }) {
  return r.deliveredAt ? (
    <span>{formatDateTime(r.deliveredAt)}</span>
  ) : (
    <span className="text-[var(--text-muted)]">не вручён · заказ {formatDateTime(r.createdAt)}</span>
  );
}

export function OrderCell({ r }: { r: GiftRegistryRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/orders/${r.orderId}`} className="hit font-semibold hover:text-[var(--accent-hi)]">
        {shortId(r.orderId)}
      </Link>
      <span className="text-[var(--text-faint)]">{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</span>
    </span>
  );
}

export function Person({ r }: { r: Pick<GiftRegistryRow, "customerName" | "phone" | "tgUsername"> }) {
  return (
    <div className="min-w-0">
      <div className="break-words font-semibold">{r.customerName}</div>
      <div className="text-[12px] text-[var(--text-muted)]">
        {r.phone}
        {r.tgUsername ? ` · @${r.tgUsername}` : ""}
      </div>
    </div>
  );
}

export function GiftCell({ r }: { r: GiftRegistryRow }) {
  return (
    <div className="min-w-0">
      <div className="break-words">
        {r.title}
        {r.variant ? ` · ${r.variant}` : ""}
      </div>
      <div className="text-[12px] text-[var(--text-faint)]">
        {GIFT_SOURCE_LABEL[r.source] ?? r.source}
        {r.tier ? ` · ${CASE_TIER_LABEL[r.tier]}` : ""}
      </div>
    </div>
  );
}

export function MonthTotal({ r }: { r: GiftRegistryRow }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className={cn(r.overLimit && "font-semibold text-[var(--danger-ink)]")}>{money(r.monthTotalMinor)}</span>
      {r.overLimit ? <Badge tone="danger">сверх лимита</Badge> : <span className="text-[11.5px] text-[var(--text-faint)]">за {r.month}</span>}
    </span>
  );
}
