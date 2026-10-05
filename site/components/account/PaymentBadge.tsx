"use client";

/**
 * Payment state chip (orders list, order header): paid / partially paid (prepayment, rest on
 * delivery) / awaiting online payment before the deadline / unpaid.
 */
import { Check, Clock, CreditCard } from "lucide-react";
import type { PaymentState } from "@shop/shared";
import { useT } from "@/i18n/context";

const CHIP = "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[.06em]";

export function PaymentBadge({ state }: { state: PaymentState }) {
  const t = useT();
  if (state === "PAID") {
    return (
      <span className={`${CHIP} bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-[var(--ok)]`}>
        <Check className="h-3 w-3" strokeWidth={2.5} />
        {t("payment.paid")}
      </span>
    );
  }
  if (state === "PARTIAL") {
    return (
      <span className={`${CHIP} bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]`}>
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        {t("payment.partial")}
      </span>
    );
  }
  if (state === "AWAITING") {
    return (
      <span className={`${CHIP} bg-[var(--accent-soft)] text-[var(--accent-hi)]`}>
        <CreditCard className="h-3 w-3" strokeWidth={2.5} />
        {t("payment.awaiting")}
      </span>
    );
  }
  return <span className={`${CHIP} bg-[var(--surface-3)] text-[var(--muted)]`}>{t("payment.unpaid")}</span>;
}
