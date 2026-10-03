"use client";

/** Order-status pill — NEO-BRUTALISM: solid status color, ink border, sharp. */
import type { OrderStatus } from "@shop/shared";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/context";
import { ORDER_STATUS_COLOR } from "@shop/shared";

export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT();
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--accent-ink)]"
      style={{ background: color }}
    >
      {t(`status.${status}` as MessageKey)}
    </span>
  );
}
