"use client";

/**
 * The checkout form: state, validation and the order request. Sections and the summary are
 * presentational (ui/*Section, SummaryPanel).
 *
 * Order creation is exactly the Mini App's (frontend/app/checkout/page.tsx): POST /api/orders with
 * an Idempotency-Key per attempt, the promo code sent ONLY when the server has just confirmed it,
 * and PROMO_REJECTED handled by dropping the code and asking for one more click.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type DeliveryMethod } from "@shop/core/types";
import { isValidPhone } from "@shop/core/phone";
import { type OrderLimitCode } from "@shop/core/orders";
import { buildCreateOrderRequest, isValidCustomerName } from "@shop/customer/checkout/order-request";
import { useCreateOrder } from "@shop/customer/checkout/use-create-order";
import { useNpSelection } from "@shop/customer/delivery/np-selection";
import { markGiftCaseAutoOpen } from "@shop/ui/gift-case";
import { orderCreatedHref } from "@/features/payment";
import { useI18n } from "@/i18n/context";
import { trackOrderCreated } from "@/lib/analytics";
import { api } from "@/lib/api";
import { cartAfterOrder, flushCart, useCart, useCartSubtotal, useCartValidation } from "@/features/cart";
import { describeFailure, firstInvalidSection } from "../model/failure";
import { useCheckoutTotals, useLastOrderPrefill, usePaymentChoice } from "../queries";
import { ContactsSection } from "./ContactsSection";
import { DeliverySection } from "./DeliverySection";
import { PaymentSection } from "./PaymentSection";
import { PromoField } from "./PromoField";
import { Section } from "./parts";
import { SummaryPanel } from "./SummaryPanel";

/** `onPlaced`: the order exists and the cart is emptied — the parent covers the empty-cart state. */
export function CheckoutForm({ onPlaced }: { onPlaced: (orderId: string) => void }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";
  useCartValidation(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  // City, branch, map focus, "branch from the last order" — @shop/customer/delivery/np-selection.
  const np = useNpSelection(api.checkout);
  const { warehouse } = np;
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  useLastOrderPrefill(np, { setName, setPhone, setDelivery, setPrefilled });

  // One idempotency key per checkout attempt (useApiMutation, idempotent); a quantity change still in its
  // debounce reaches the server cart BEFORE the order (flushCart runs first, inside the mutation).
  const placeOrder = useCreateOrder(api.checkout, flushCart);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** The last refusal was an anti-bot limit (TOO_MANY_UNPAID → link to my orders). */
  const [limitCode, setLimitCode] = useState<OrderLimitCode | null>(null);

  const { promo, promoValid, discount, baseTotal, gift, giftTier, giftChoice, setGiftChoice, giftDiscount, total } = useCheckoutTotals(promoCode, subtotal);
  const pay = usePaymentChoice(total);

  const nameOk = isValidCustomerName(name);
  const phoneOk = isValidPhone(phone);
  const deliveryOk = delivery === "PICKUP" || !!warehouse;
  const paymentOk = !!pay.chosen;
  const hasProblems = lines.some((l) => l.stock <= 0);
  const formOk = nameOk && phoneOk && deliveryOk && paymentOk && !hasProblems && subtotal > 0;

  async function submit() {
    setTouched(true);
    setSubmitError(null);
    setLimitCode(null);
    if (!formOk) {
      setSubmitError(hasProblems ? t("cart.hasProblems") : t("checkout.fixErrors"));
      document.getElementById(firstInvalidSection({ nameOk, phoneOk, deliveryOk }))?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    const orderable = lines.filter((l) => l.stock > 0);
    const body = buildCreateOrderRequest({
      lines: orderable,
      name,
      phone,
      comment,
      // ONLY a code the server has just confirmed (see docs/archive/UI-FIXES.md §6).
      promoCode: promoValid ? promoCode.trim() : undefined,
      delivery,
      warehouse,
      paymentOptionId: pay.chosen!.id,
      giftChoice: giftTier ? (giftDiscount > 0 ? "DISCOUNT" : "CASE") : undefined,
    });
    try {
      const created = await placeOrder.mutateAsync(body);
      trackOrderCreated(created.orderId);
      if (giftTier && giftDiscount === 0) markGiftCaseAutoOpen(created.orderId);
      cartAfterOrder(orderable.map((l) => l.key));
      onPlaced(created.orderId);
      const orderPage = href(`/account/orders/${created.orderId}`);
      // Something to pay: the order page shows the "order created" step — amount, 24 h countdown,
      // «Оплатити» (the monobank form opens over the page) and «Скасувати». Nothing opens by itself.
      router.push(created.amountDueMinor > 0 ? orderCreatedHref(orderPage) : orderPage);
    } catch (e) {
      const failure = describeFailure(e, t);
      if (failure.dropPromo) setPromoCode("");
      setSubmitError(failure.message);
      setLimitCode(failure.limitCode);
      setSubmitting(false);
    }
  }

  return (
    <div className="container-site pt-8">
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("checkout.title")}</h1>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <ContactsSection
            name={name}
            phone={phone}
            onName={setName}
            onPhone={setPhone}
            nameOk={nameOk}
            phoneOk={phoneOk}
            touched={touched}
            prefilled={prefilled}
          />
          <DeliverySection delivery={delivery} onDelivery={setDelivery} np={np} touched={touched} />
          <PaymentSection
            status={pay.status}
            options={pay.options}
            chosenId={pay.chosenId}
            onChoose={pay.choose}
            currency={currency}
            showRequired={touched && !paymentOk}
          />
          <Section n={4} title={`${t("checkout.promo")} · ${t("checkout.comment")}`}>
            <PromoField
              code={promoCode}
              onChange={setPromoCode}
              subtotal={subtotal}
              currency={currency}
              preview={{ data: promo.data, loading: promo.loading }}
            />
            <label className="mt-5 block">
              <span className="eyebrow mb-1.5 block text-[11px]">{t("checkout.comment")}</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("checkout.commentPlaceholder")}
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </label>
          </Section>
        </div>

        <SummaryPanel
          lines={lines}
          currency={currency}
          subtotal={subtotal}
          discount={discount}
          promoCode={promoCode}
          promo={promo}
          gift={gift}
          giftTier={giftTier}
          giftChoice={giftChoice}
          onGiftChoice={setGiftChoice}
          giftDiscount={giftDiscount}
          baseTotal={baseTotal}
          total={total}
          chosen={pay.chosen}
          dueNow={pay.dueNow}
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
