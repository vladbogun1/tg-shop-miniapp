"use client";

import { Banknote, CreditCard, ShieldCheck, Wallet } from "lucide-react";
import { isOnDelivery } from "@shop/customer/checkout/payment-choice";
import type { NpPaymentOption } from "@shop/customer/delivery/contract";
import { RadioCard } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import { money } from "@/lib/money";

export function PaymentStep({
  options,
  loading,
  error,
  selected,
  onSelect,
  currency,
  noneForDelivery,
  switched,
}: {
  options: NpPaymentOption[];
  loading: boolean;
  error: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  currency: string;
  /** There are options, but none fits this delivery or sum. */
  noneForDelivery: boolean;
  /** The choice changed by itself (the previous one does not fit the delivery or the sum any more). */
  switched: boolean;
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
        {t(noneForDelivery ? "delivery.pay.noneForDelivery" : "checkout.payment.none")}
      </p>
    );
  }
  const onDelivery = isOnDelivery(options.find((o) => o.id === selected));
  return (
    <div className="flex flex-col gap-3">
      {options.map((o) => (
        <RadioCard
          key={o.id}
          selected={selected === o.id}
          onSelect={() => onSelect(o.id)}
          title={o.title}
          subtitle={<OptionSubtitle o={o} currency={currency} />}
          icon={optionIcon(o)}
        />
      ))}
      {switched && <p className="px-0.5 text-[12px] font-semibold text-[var(--muted)]">{t("delivery.pay.switched")}</p>}
      {onDelivery ? <p className="px-0.5 text-[12px] font-medium text-[var(--muted)]">{t("delivery.pay.noDeadline")}</p> : <PaymentTrust />}
    </div>
  );
}

function optionIcon(o: NpPaymentOption) {
  if (isOnDelivery(o)) return <Banknote className="h-5 w-5" strokeWidth={2.5} />;
  return o.requiresPrepayment && o.prepaymentMinor ? <Wallet className="h-5 w-5" strokeWidth={2.5} /> : <CreditCard className="h-5 w-5" strokeWidth={2.5} />;
}

/**
 * Our own wording rather than the option description: online options are paid now through monobank, and older
 * descriptions still talk about a transfer to a card. «При отриманні» — cash / card to Nova Poshta.
 */
function OptionSubtitle({ o, currency }: { o: NpPaymentOption; currency: string }) {
  const t = useT();
  const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
  const main = isOnDelivery(o)
    ? t("delivery.pay.onDelivery.sub")
    : prepay
      ? t("checkout.payment.prepayOnline", { amount: money(o.prepaymentMinor!, currency) })
      : t("checkout.payment.full");
  return (
    <>
      {main}
      {o.maxTotalMinor != null && o.maxTotalMinor > 0 && (
        <span className="mt-0.5 block text-[12px] text-[var(--faint)]">{t("delivery.pay.maxHint", { amount: money(o.maxTotalMinor, currency) })}</span>
      )}
    </>
  );
}

/** "Оплата через monobank" + the 24-hour rule — under the online options and on the summary. */
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
