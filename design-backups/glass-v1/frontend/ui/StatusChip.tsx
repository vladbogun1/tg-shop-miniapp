"use client";

/** Order-status pill with a status-tinted glass background. */
import type { OrderStatus } from "@/lib/api";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";

export function StatusChip({ status }: { status: OrderStatus }) {
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-[var(--r-pill)] px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
