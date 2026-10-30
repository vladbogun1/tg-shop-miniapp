"use client";

/** Order-status pill: tint of the status colour, text and dot in the colour itself. Подпись даёт приложение (i18n). */
import { ORDER_STATUS_COLOR } from "@shop/core/orders";
import type { OrderStatus } from "@shop/core/types";
import { useUiLook } from "../look";

export function StatusChip({ status, label }: { status: OrderStatus; label: string }) {
  const miniapp = useUiLook() === "miniapp";
  const color = ORDER_STATUS_COLOR[status];
  return (
    <span
      className={
        miniapp
          ? "font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
          : "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[.08em]"
      }
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full${miniapp ? " shrink-0" : ""}`} style={{ background: color }} />
      {label}
    </span>
  );
}
