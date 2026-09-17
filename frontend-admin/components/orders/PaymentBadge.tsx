"use client";

/**
 * Payment status badge.
 *
 * "Оплата на проверке" is a first-class state on purpose: a customer uploading a transfer
 * screenshot only files a CLAIM. Rendering that as «Оплачен» is what let an unpaid order look
 * settled — and the seller then shipped it with the cash-on-delivery amount zeroed out.
 */
import { Check, Clock, Wallet } from "lucide-react";
import { PAYMENT_STATE_LABEL, paymentState } from "@shop/shared";
import { Badge } from "@/components/ui/Badge";

export interface PaymentLike {
  paid: boolean;
  paymentClaimed?: boolean;
  totalMinor?: number;
  receivedMinor?: number;
}

export function PaymentBadge({ order, icon = true }: { order: PaymentLike; icon?: boolean }) {
  const state = paymentState(order);
  if (state === "PAID") {
    return (
      <Badge tone="ok">
        {icon && <Check className="h-3 w-3" strokeWidth={3} />}
        {PAYMENT_STATE_LABEL.PAID}
      </Badge>
    );
  }
  if (state === "CLAIMED" || state === "PARTIAL") {
    return (
      <Badge tone="warn">
        {icon && <Clock className="h-3 w-3" strokeWidth={3} />}
        {PAYMENT_STATE_LABEL[state]}
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
