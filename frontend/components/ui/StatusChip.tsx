"use client";

/** Order-status pill — ChiSetup: status tint at 16%, text + dot in the status colour, no ink border. */
import type { OrderStatus } from "@/lib/api";
import { useT } from "@/i18n/context";
import { ORDER_STATUS_COLOR } from "@/lib/format";

export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT();
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {t(`status.${status}`)}
    </span>
  );
}
