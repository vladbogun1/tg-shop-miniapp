"use client";

/**
 * Order-status pill: tint of the status colour, text and dot in the colour itself. Подпись даёт приложение (i18n).
 * `color` вместо `status` — тот же чип другого статуса (стадия посылки Нової пошти).
 */
import { ORDER_STATUS_COLOR } from "@shop/core/orders";
import type { OrderStatus } from "@shop/core/types";
import { useUiLook } from "../look";
import { tint } from "@shop/ui/tint";

type StatusChipProps = { label: string } & ({ status: OrderStatus; color?: undefined } | { status?: undefined; color: string });

export function StatusChip({ status, label, color: own }: StatusChipProps) {
  const miniapp = useUiLook() === "miniapp";
  const color = own ?? ORDER_STATUS_COLOR[status as OrderStatus];
  return (
    <span
      className={
        miniapp
          ? "font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
          : "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[.08em]"
      }
      style={{ background: tint(color, 16), color }}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full${miniapp ? " shrink-0" : ""}`} style={{ background: color }} />
      {label}
    </span>
  );
}
