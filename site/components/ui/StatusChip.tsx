"use client";

/** Order-status pill: dark tint of the status colour, text and dot in the colour itself. */
import type { OrderStatus } from "@shop/shared";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/context";
import { ORDER_STATUS_COLOR } from "@shop/shared";

export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT();
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[.08em]"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {t(`status.${status}` as MessageKey)}
    </span>
  );
}
