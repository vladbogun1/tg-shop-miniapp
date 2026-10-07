"use client";

/**
 * Payment status badge.
 *
 * Payment is online only (monobank): PAID / PARTIAL (prepayment online, the rest cash on delivery)
 * come from what actually arrived; AWAITING = the customer still has to pay before `paymentDueAt`
 * (24 h, then the order is cancelled automatically) — with the time left when `showTimeLeft`.
 */
import { Check, Clock, Wallet } from "lucide-react";
import { PAYMENT_STATE_LABEL, paymentState, type OrderStatus } from "@shop/shared";
import { Badge } from "@/components/ui/Badge";
import { isOverdue, timeLeft } from "@/lib/online-payment";

export interface PaymentLike {
  paid: boolean;
  status?: OrderStatus;
  totalMinor?: number;
  receivedMinor?: number;
  amountDueMinor?: number;
  paymentDueAt?: string | null;
}

export function PaymentBadge({
  order,
  icon = true,
  showTimeLeft = false,
}: {
  order: PaymentLike;
  icon?: boolean;
  /** Append «· 5 ч» (or «· просрочено») to «Ждёт оплаты». */
  showTimeLeft?: boolean;
}) {
  const state = paymentState(order);
  if (state === "PAID") {
    return (
      <Badge tone="ok">
        {icon && <Check className="h-3 w-3" strokeWidth={3} />}
        {PAYMENT_STATE_LABEL.PAID}
      </Badge>
    );
  }
  if (state === "PARTIAL") {
    return (
      <Badge tone="warn">
        {icon && <Wallet className="h-3 w-3" />}
        {PAYMENT_STATE_LABEL.PARTIAL}
      </Badge>
    );
  }
  if (state === "AWAITING") {
    const due = order.paymentDueAt as string;
    const overdue = isOverdue(due);
    const left = showTimeLeft && !overdue ? timeLeft(due) : null;
    return (
      <Badge tone={overdue ? "danger" : "warn"}>
        {icon && <Clock className="h-3 w-3" strokeWidth={3} />}
        {PAYMENT_STATE_LABEL.AWAITING}
        {showTimeLeft && (overdue ? " · просрочено" : left ? ` · ${left}` : null)}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      {icon && <Wallet className="h-3 w-3" />}
      {PAYMENT_STATE_LABEL.UNPAID}
    </Badge>
  );
}
