"use client";

/** Payment state chip (copied from the Mini App's PaidBadge): a claim is not a confirmation. */
import { Check, Clock } from "lucide-react";
import type { PaymentState } from "@shop/shared";
import { useT } from "@/i18n/context";

export function PaymentBadge({ state }: { state: PaymentState }) {
  const t = useT();
  if (state === "PAID") {
    return (
      <span className="nb-up flex shrink-0 items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--c4)] px-2 py-0.5 text-[11px] font-black text-[var(--accent-ink)]">
        <Check className="h-3 w-3" strokeWidth={3} />
        {t("payment.paid")}
      </span>
    );
  }
  if (state === "PARTIAL" || state === "CLAIMED") {
    return (
      <span className="nb-up flex shrink-0 items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[11px] font-black text-[var(--accent-ink)]">
        <Clock className="h-3 w-3" strokeWidth={3} />
        {state === "PARTIAL" ? t("payment.partial") : t("payment.claimed")}
      </span>
    );
  }
  return (
    <span className="nb-up shrink-0 border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-black text-[var(--muted)]">
      {t("payment.unpaid")}
    </span>
  );
}
