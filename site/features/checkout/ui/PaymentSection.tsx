import { CreditCard, Wallet } from "lucide-react";
import { type PaymentOption } from "@shop/core/types";
import { RadioCard } from "@shop/ui/primitives";
import { PaymentTrust } from "@/components/order/Payment";
import { useI18n } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";
import { Section } from "./parts";

interface Props {
  status: "loading" | "error" | "ready";
  options: PaymentOption[];
  chosenId: string | null;
  onChoose: (id: string) => void;
  currency: string;
  /** The submit was attempted without a payment option. */
  showRequired: boolean;
}

export function PaymentSection({ status, options, chosenId, onChoose, currency, showRequired }: Props) {
  const { t } = useI18n();
  const fmt = useFmt();
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
        <p className="text-[14px] font-medium text-[var(--muted)]">{t("checkout.paymentNone")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("checkout.payment")} className="flex flex-col gap-3">
          {options.map((o) => {
            const prepay = o.requiresPrepayment && !!o.prepaymentMinor;
            return (
              <RadioCard
                key={o.id}
                selected={chosenId === o.id}
                onSelect={() => onChoose(o.id)}
                title={o.title}
                subtitle={
                  <>
                    {prepay
                      ? t("checkout.pay.prepay", { amount: fmt.money(o.prepaymentMinor, currency) })
                      : t("checkout.pay.full")}
                    {o.description && <span className="mt-0.5 block text-[12px] text-[var(--faint)]">{o.description}</span>}
                  </>
                }
                icon={
                  prepay ? <Wallet className="h-5 w-5" strokeWidth={2.5} /> : <CreditCard className="h-5 w-5" strokeWidth={2.5} />
                }
              />
            );
          })}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          <PaymentTrust />
          <p className="text-[12px] font-medium text-[var(--faint)]">{t("checkout.pay.deadline")}</p>
        </div>
      )}
      {showRequired && <p className="mt-3 text-[13px] font-medium text-[var(--danger)]">{t("checkout.paymentRequired")}</p>}
    </Section>
  );
}
