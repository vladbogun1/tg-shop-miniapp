"use client";

import { Clock } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { isOverdue, timeLeft } from "../model/online-payment";
import type { PaymentOrder } from "../model/types";

/** «Оплатить до …»: срок, сколько осталось или «просрочено», и сколько платить онлайн. */
export function DeadlineNotice({ order, now }: { order: PaymentOrder; now: number }) {
  const due = order.paymentDueAt as string;
  const overdue = isOverdue(due, now);
  const left = overdue ? null : timeLeft(due, now);
  const cur = order.currency;
  return (
    <div
      className={cn(
        "mb-3 flex items-start gap-2 rounded-[var(--r-md)] border px-3 py-2.5 text-[13px]",
        overdue
          ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger-ink)]"
          : "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[var(--text)]"
      )}
    >
      <Clock className={cn("mt-0.5 h-4 w-4 shrink-0", !overdue && "text-[var(--warn)]")} />
      <span className="min-w-0">
        <b className="font-semibold">Оплатить до {formatDateTime(order.paymentDueAt as string)}</b>
        {overdue ? (
          // Only NEW orders are auto-cancelled (OrderService.expireUnpaid); an approved one stays.
          order.status === "NEW" ? (
            <> · просрочено — заказ отменится автоматически</>
          ) : (
            <> · срок прошёл, но заказ одобрен: покупатель всё ещё может оплатить. Не будет платить — отклоните заказ</>
          )
        ) : (
          left && <> · осталось {left}</>
        )}
        {order.amountDueMinor > 0 && (
          <span className="block text-[12px] text-[var(--text-muted)]">
            К оплате онлайн: <b className="tabular font-semibold text-[var(--text)]">{money(order.amountDueMinor, cur)}</b>
            {order.prepaymentMinor > 0 && order.amountDueMinor < order.totalMinor && <> (предоплата, остаток — наложкой)</>}
          </span>
        )}
      </span>
    </div>
  );
}
