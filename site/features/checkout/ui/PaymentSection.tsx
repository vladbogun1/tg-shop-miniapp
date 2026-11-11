import { Banknote, CreditCard, Wallet } from "lucide-react";
import { isOnDelivery } from "@shop/customer/checkout/payment-choice";
import type { NpPaymentOption } from "@shop/customer/delivery/contract";
import { RadioCard } from "@shop/ui/primitives";
import { PaymentTrust } from "@/features/payment";
import { useCheckoutT } from "@/i18n/checkout";
import { useFmt } from "@/lib/use-fmt";
import { Section } from "./parts";

interface Props {
  status: "loading" | "error" | "ready";
  options: NpPaymentOption[];
  chosenId: string | null;
  onChoose: (id: string) => void;
  currency: string;
  /** The submit was attempted without a payment option. */
  showRequired: boolean;
  /** Варианты есть, но ни один не подходит к этой доставке или сумме. */
  noneForDelivery: boolean;
  /** Выбор сменился сам (прежний недоступен для доставки или суммы). */
  switched: boolean;
}

export function PaymentSection({ status, options, chosenId, onChoose, currency, showRequired, noneForDelivery, switched }: Props) {
  const t = useCheckoutT();
  const fmt = useFmt();
  const onDelivery = isOnDelivery(options.find((o) => o.id === chosenId));
  return (
    <Section id="co-payment" n={3} title={t("checkout.payment")}>
      {status === "loading" ? (
        <div className="flex flex-col gap-3">
          <div className="shimmer h-20" />
          <div className="shimmer h-20" />
        </div>
      ) : status === "error" ? (
        <p className="text-[14px] font-medium text-[var(--danger)]">{t("checkout.paymentError")}</p>
      ) : options.length === 0 ? (
        <p className="text-[14px] font-medium text-[var(--muted)]">{t(noneForDelivery ? "delivery.pay.noneForDelivery" : "checkout.paymentNone")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("checkout.payment")} className="flex flex-col gap-3">
          {options.map((o) => (
            <RadioCard
              key={o.id}
              selected={chosenId === o.id}
              onSelect={() => onChoose(o.id)}
              title={o.title}
              subtitle={<OptionSubtitle o={o} currency={currency} />}
              icon={optionIcon(o)}
            />
          ))}
        </div>
      )}
      {switched && <p className="mt-3 text-[13px] font-medium text-[var(--muted)]">{t("delivery.pay.switched")}</p>}
      {options.length > 0 &&
        (onDelivery ? (
          // Онлайн платить нечего: ни monobank, ни 24 часов на оплату.
          <p className="mt-4 text-[12px] font-medium text-[var(--faint)]">{t("delivery.pay.noDeadline")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-1.5">
            <PaymentTrust />
            <p className="text-[12px] font-medium text-[var(--faint)]">{t("checkout.pay.deadline")}</p>
          </div>
        ))}
      {showRequired && <p className="mt-3 text-[13px] font-medium text-[var(--danger)]">{t("checkout.paymentRequired")}</p>}
    </Section>
  );
}

function optionIcon(o: NpPaymentOption) {
  if (isOnDelivery(o)) return <Banknote className="h-5 w-5" strokeWidth={2.5} />;
  return o.requiresPrepayment && o.prepaymentMinor ? <Wallet className="h-5 w-5" strokeWidth={2.5} /> : <CreditCard className="h-5 w-5" strokeWidth={2.5} />;
}

function OptionSubtitle({ o, currency }: { o: NpPaymentOption; currency: string }) {
  const t = useCheckoutT();
  const fmt = useFmt();
  const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
  const main = isOnDelivery(o)
    ? t("delivery.pay.onDelivery.sub")
    : prepay
      ? t("checkout.pay.prepay", { amount: fmt.money(o.prepaymentMinor, currency) })
      : t("checkout.pay.full");
  return (
    <>
      {main}
      {o.maxTotalMinor != null && o.maxTotalMinor > 0 && (
        <span className="mt-0.5 block text-[12px] text-[var(--faint)]">{t("delivery.pay.maxHint", { amount: fmt.money(o.maxTotalMinor, currency) })}</span>
      )}
      {o.description && <span className="mt-0.5 block text-[12px] text-[var(--faint)]">{o.description}</span>}
    </>
  );
}
