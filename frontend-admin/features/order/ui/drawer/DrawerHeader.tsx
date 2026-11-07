"use client";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { PaymentBadge } from "@/features/payment";
import { ReturnBadge } from "@/features/returns";
import type { ReactNode } from "react";
import type { AdminOrderDetail } from "../../api";
import { shortId } from "../../model/status";
import { SourceBadge } from "../board/SourceBadge";
import { headerLine } from "./header-line";

const LINE_TONE = {
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger-ink)]",
  neutral: "text-[var(--text-muted)]",
} as const;

/**
 * Шапка в две строки. Первая: `#a1b2c3d4 · Иванов И.` (имя обрезается) и статус справа от него (на телефоне статус — в начале второй).
 * Вторая — чипы без переноса (оплата, источник, возврат, архив) и срочное про деньги: дедлайн оплаты или наложка.
 * `tabs` — вкладки в той же полосе (на ПК); на телефоне вкладки идут отдельной строкой под шапкой.
 */
export function DrawerHeader({ order, archived, tabs }: { order: AdminOrderDetail | undefined; archived: boolean; tabs?: ReactNode }) {
  const line = order ? headerLine(order) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-9 min-w-0 items-center gap-x-2 pointer-coarse:min-h-11">
        <span className="font-display tabular shrink-0 text-[17px] font-bold leading-none tracking-[0.02em] text-[var(--ink)]">
          {order ? shortId(order.id) : "Заказ"}
        </span>
        {order?.customerName && (
          <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--text)]" title={order.customerName}>
            · {order.customerName}
          </span>
        )}
        {order && <StatusBadge status={order.status} className="shrink-0 max-sm:hidden" />}
        {tabs && <div className="ml-auto hidden shrink-0 sm:block">{tabs}</div>}
      </div>
      {order && (
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,#000_85%,transparent)] [&::-webkit-scrollbar]:hidden">
          {/* Phone: the status starts the second line, so the name in the first one is not cut to two letters. */}
          <StatusBadge status={order.status} className="shrink-0 sm:hidden" />
          <PaymentBadge order={order} />
          <SourceBadge source={order.source} />
          <ReturnBadge status={order.admin?.returnStatus} />
          {archived && <Badge>В архиве</Badge>}
          {line && <span className={cn("tabular shrink-0 text-[12.5px] font-semibold", LINE_TONE[line.tone])}>{line.text}</span>}
        </div>
      )}
    </div>
  );
}
