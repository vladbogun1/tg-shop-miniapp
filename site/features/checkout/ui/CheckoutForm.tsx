"use client";

/**
 * The checkout form layout. State, validation and the order request — use-checkout-form; sections and the
 * summary are presentational (ui/*Section, SummaryPanel).
 */
import { useI18n } from "@/i18n/context";
import { ContactsSection } from "./ContactsSection";
import { DeliverySection } from "./DeliverySection";
import { PaymentSection } from "./PaymentSection";
import { PromoField } from "./PromoField";
import { Section } from "./parts";
import { SummaryPanel } from "./SummaryPanel";
import { useCheckoutForm } from "./use-checkout-form";

/** `onPlaced`: the order exists and the cart is emptied — the parent covers the empty-cart state. */
export function CheckoutForm({ onPlaced }: { onPlaced: (orderId: string) => void }) {
  const { t } = useI18n();
  const f = useCheckoutForm(onPlaced);
  const { d, pay, totals, place, currency, touched } = f;
  const { submitting, submitError, limitCode, fieldError, clearFieldError } = place;
  const { gift, giftDiscount } = totals;

  return (
    <div className="container-site pt-8">
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("checkout.title")}</h1>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          f.submit();
        }}
        className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <ContactsSection
            recipient={d.recipient}
            onRecipient={(r) => {
              clearFieldError();
              d.setRecipient(r);
            }}
            phone={f.phone}
            onPhone={(v) => {
              clearFieldError();
              f.setPhone(v);
            }}
            serverField={fieldError}
            latinAllowed={d.draft.tab === "PICKUP"}
            phoneOk={f.phoneOk}
            touched={touched}
            prefilled={f.prefilled}
          />
          <DeliverySection d={d} tabs={f.tabs} touched={touched || fieldError === "address"} estimate={f.estimate} currency={currency} payOnDelivery={pay.payOnDelivery > 0} />
          <PaymentSection
            status={pay.status}
            options={pay.options}
            chosenId={pay.chosenId}
            onChoose={pay.choose}
            currency={currency}
            showRequired={touched && !f.paymentOk}
            noneForDelivery={pay.noneForDelivery}
            switched={pay.switched}
          />
          <Section n={4} title={`${t("checkout.promo")} · ${t("checkout.comment")}`}>
            <PromoField code={f.promoCode} onChange={f.setPromoCode} subtotal={f.subtotal} currency={currency} preview={{ data: totals.promo.data, loading: totals.promo.loading }} />
            <label className="mt-5 block">
              <span className="eyebrow mb-1.5 block text-[11px]">{t("checkout.comment")}</span>
              <textarea
                value={f.comment}
                onChange={(e) => f.setComment(e.target.value)}
                placeholder={t("checkout.commentPlaceholder")}
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </label>
          </Section>
        </div>

        <SummaryPanel
          lines={f.lines}
          currency={currency}
          subtotal={f.subtotal}
          discount={totals.discount}
          promoCode={f.promoCode}
          promo={totals.promo}
          gift={gift}
          giftTier={totals.giftTier}
          giftChoice={totals.giftChoice}
          onGiftChoice={totals.setGiftChoice}
          giftDiscount={giftDiscount}
          baseTotal={totals.baseTotal}
          total={totals.total}
          chosen={pay.chosen}
          dueNow={pay.dueNow}
          tab={d.tab}
          estimate={f.estimate.estimate}
          // The gift case is earned: the submit says so («Оформити + 🎁 кейс»); the summary line stays.
          submitLabel={gift?.kind === "CASE" && giftDiscount === 0 ? t("case.submit") : t("checkout.submit")}
          submitting={submitting}
          submitError={submitError}
          limitCode={limitCode}
        />
      </form>
    </div>
  );
}
