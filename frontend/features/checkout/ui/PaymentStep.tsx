"use client";

import { CreditCard, ShieldCheck, Wallet } from "lucide-react";
import { RadioCard } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import type { PaymentOption } from "@/lib/api";
import { money } from "@/lib/money";

export function PaymentStep({
  options,
  loading,
  error,
  selected,
  onSelect,
  currency,
}: {
  options: PaymentOption[];
  loading: boolean;
  error: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  currency: string;
}) {
  const t = useT();
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="shimmer h-20 rounded-[var(--r)]" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-[var(--r-card)] border border-[var(--danger)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--danger)] shadow-[0_8px_24px_-12px_var(--shadow)]">
        {t("checkout.payment.error")}
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-[13px] font-bold text-[var(--muted)] shadow-[0_8px_24px_-12px_var(--shadow)]">
        {t("checkout.payment.none")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => {
        const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
        return (
          <RadioCard
            key={o.id}
            selected={selected === o.id}
            onSelect={() => onSelect(o.id)}
            title={o.title}
            // Our own wording rather than the option description: every option is paid online
            // now, and older descriptions still talk about a transfer to a card.
            subtitle={
              prepay
                ? t("checkout.payment.prepayOnline", { amount: money(o.prepaymentMinor!, currency) })
                : t("checkout.payment.full")
            }
            icon={
              prepay ? (
                <Wallet className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <CreditCard className="h-5 w-5" strokeWidth={2.5} />
              )
            }
          />
        );
      })}
      <PaymentTrust />
    </div>
  );
}

/** "Оплата через monobank" + the 24-hour rule — under the options and on the summary. */
export function PaymentTrust() {
  const t = useT();
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.5} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--ink)]">{t("checkout.payment.trust")}</p>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{t("checkout.payment.deadline")}</p>
      </div>
    </div>
  );
}
