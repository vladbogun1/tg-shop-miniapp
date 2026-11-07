"use client";

import { UserRound } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import type { OrderStatus } from "@shop/core/types";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { shortOrderId as shortId } from "@shop/core/format";
import type { ManualDiscountOrder } from "../model/types";

/** An order with a manual amount/percent discount — a table row, opens the order. */
export function ManualRow({ o, onOpen }: { o: ManualDiscountOrder; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] sm:px-4"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--surface-3)] text-[var(--text-muted)]">
        <UserRound className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--ink)]">{o.customerName || "Без имени"}</span>
          <StatusBadge status={o.status as OrderStatus} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          <span>{o.label}</span>
          <span className="font-semibold text-[var(--ok)]">−{money(o.discountMinor)}</span>
          <span className="text-[var(--text-faint)]">
            заказ {shortId(o.id)} · {money(o.totalMinor)} · {formatDateTime(o.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
