"use client";

/**
 * Payment pill for an order — the orders list and the order page show the same one.
 * AWAITING = placed, online payment still due before the deadline (`paymentDueAt`).
 */
import { Check, Clock } from "lucide-react";
import type { PaymentState } from "@shop/shared";
import { useT } from "@/i18n/context";

export function PaymentBadge({ state, size = "md" }: { state: PaymentState; size?: "sm" | "md" }) {
  const t = useT();
  const text = size === "sm" ? "text-[10px]" : "text-[10.5px]";
  if (state === "PAID") {
    return (
      <span
        className={`nb-up flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] px-2 py-0.5 ${text} font-semibold text-[var(--ok)]`}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
        {t("payment.paid")}
      </span>
    );
  }
  if (state === "PARTIAL" || state === "AWAITING") {
    return (
      <span
        className={`nb-up flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] px-2 py-0.5 ${text} font-semibold text-[var(--warn)]`}
      >
        <Clock className="h-3 w-3" strokeWidth={3} />
        {state === "PARTIAL" ? t("payment.partial") : t("payment.awaiting")}
      </span>
    );
  }
  return (
    <span
      className={`nb-up shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 ${text} font-semibold text-[var(--muted)]`}
    >
      {t("payment.unpaid")}
    </span>
  );
}
