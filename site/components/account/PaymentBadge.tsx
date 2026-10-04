"use client";

/** Payment state chip (copied from the Mini App's PaidBadge): a claim is not a confirmation. */
import { Check, Clock } from "lucide-react";
import type { PaymentState } from "@shop/shared";
import { useT } from "@/i18n/context";

export function PaymentBadge({ state }: { state: PaymentState }) {
  const t = useT();
  if (state === "PAID") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[.06em] bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-[var(--ok)]">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        {t("payment.paid")}
      </span>
    );
  }
  if (state === "PARTIAL" || state === "CLAIMED") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[.06em] bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]">
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        {state === "PARTIAL" ? t("payment.partial") : t("payment.claimed")}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[.06em] bg-[var(--surface-3)] text-[var(--muted)]">
      {t("payment.unpaid")}
    </span>
  );
}
