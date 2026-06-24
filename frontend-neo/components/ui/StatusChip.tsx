"use client";

/** Order-status pill — NEO-BRUTALISM: solid status color, ink border, sharp. */
import type { OrderStatus } from "@/lib/api";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";

export function StatusChip({ status }: { status: OrderStatus }) {
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--ink)]"
      style={{ background: color }}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
