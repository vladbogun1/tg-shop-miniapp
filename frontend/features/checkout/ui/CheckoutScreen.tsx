"use client";

/**
 * CHECKOUT STEPPER — ChiSetup restyle.
 *   1. Контакты  — recipient (прізвище / ім'я / по батькові) + masked phone (@shop/core/phone)
 *   2. Доставка  — відділення · поштомат · кур'єр · самовивіз (checkout v2, @shop/customer/delivery).
 *                  The point is picked BY TEXT by default (city → point autocomplete, NpSearch) or on
 *                  the map (NpWarehouseMap, a tapped point waits for «Обрати»); the courier gets
 *                  street + building + flat. «≈ N ₴» from Nova Poshta never blocks the order.
 *                  The last order prefills recipient, phone, tab, point / address by ref.
 *   3. Оплата    — online (the whole amount or a prepayment, monobank within 24 h) or, where the
 *                  shop allows it for this delivery, «при отриманні» (Nova Poshta's COD).
 *   4. Подтверждение — summary → POST /api/orders → the order page (`?created=1`), which has the
 *                  «Оплатити» button and catches up with the payment when the customer comes back.
 *
 * State lives in hooks next to this file: use-checkout-form (steps 1–2, prefill),
 * use-checkout-order (promo, gift, payment option, totals), use-place-order (submit).
 * A compact StepProgress at the top and a FIXED bottom bar above the TabBar.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isValidPhone } from "@shop/core/phone";
import { deliveryOk } from "@shop/customer/delivery/draft";
import { estimateRequestOf } from "@shop/customer/delivery/estimate";
import { recipientOk } from "@shop/customer/delivery/recipient";
import { useDeliveryEstimate } from "@shop/customer/delivery/use-np-delivery";
import { StepProgress } from "@/features/checkout/ui/StepProgress";
import { useI18n } from "@/i18n/context";
import { trackCheckoutStart } from "@/lib/analytics";
import { customerApi } from "@/lib/api";
import { useCart, useCartSubtotal } from "@/features/cart";
import { money } from "@/lib/money";
import { useKeyboardOpen } from "@/lib/viewport";
import { STEP_KEYS } from "../model/steps";
import { stepIsValid, stepOfField } from "../model/totals";
import { CheckoutBottomBar } from "./CheckoutBottomBar";
import { CheckoutSteps } from "./CheckoutSteps";
import { EmptyCartState, RedirectingState } from "./CheckoutStates";
import { useCheckoutForm } from "./use-checkout-form";
import { useCheckoutOrder } from "./use-checkout-order";
import { usePlaceOrder } from "./use-place-order";

export function CheckoutScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";
  const keyboardOpen = useKeyboardOpen();

  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const form = useCheckoutForm();
  const order = useCheckoutOrder(promoCode, subtotal, form.d.tab);
  const estimate = useDeliveryEstimate(
    customerApi.checkout,
    estimateRequestOf(form.d.draft, lines, order.total, order.payOnDelivery),
    form.estimateEnabled,
  );
  const place = usePlaceOrder({
    lines,
    draft: form.d.draft,
    phone: form.phone,
    comment: form.comment,
    promoCode,
    promoValid: order.promoValid,
    setPromoCode,
    payment: order.chosenPayment,
    giftTier: order.giftTier,
    giftDiscount: order.giftDiscount,
  });

  const stepOk = stepIsValid(step, {
    recipientOk: recipientOk(form.d.recipient),
    phoneOk: isValidPhone(form.phone),
    deliveryOk: deliveryOk(form.d.draft),
    paid: !!order.chosenPayment,
  });

  // Funnel step "started checkout": once per visit of this screen, only with something to buy.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || lines.length === 0) return;
    checkoutTracked.current = true;
    trackCheckoutStart();
  }, [lines.length]);

  // A field the server rejected: back to the step that has it.
  const rejected = place.fieldError;
  useEffect(() => {
    if (rejected) setStep(stepOfField(rejected));
  }, [rejected]);

  function next() {
    setTouched(true);
    if (!stepOk) return;
    if (step < 3) {
      setTouched(false);
      setStep(step + 1); // 0→1, 1→2, 2→3 (confirmation)
    } else {
      void place.submit();
    }
  }

  function back() {
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  }

  if (lines.length === 0 && !place.placedId) return <EmptyCartState />;
  if (place.placedId) return <RedirectingState />;

  // The gift case is earned: the submit says so («Оформити + 🎁 кейс»); the summary line stays.
  const primaryLabel =
    step < 3
      ? t("common.next")
      : order.gift?.kind === "CASE" && order.giftDiscount === 0
        ? t("case.submit")
        : t("checkout.submit");

  return (
    <div className="pt-1">
      {/* Compact header: back button + current step + rail on ONE row. */}
      <div className="mb-3 flex items-center gap-2.5">
        <motion.button
          type="button"
          aria-label={t("common.back")}
          whileTap={{ scale: 0.94 }}
          onClick={back}
          className="tap -ml-1 grid h-10 w-10 min-h-0 min-w-0 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
        <div className="min-w-0 flex-1">
          <StepProgress steps={STEP_KEYS.map((k) => t(k))} current={step} />
        </div>
      </div>

      <CheckoutSteps
        step={step}
        touched={touched}
        serverField={place.fieldError}
        onFieldEdit={place.clearFieldError}
        form={form}
        order={order}
        promoCode={promoCode}
        subtotal={subtotal}
        currency={currency}
        estimate={estimate}
        items={lines.map((l) => ({
          title: l.title + (l.variantName ? ` · ${l.variantName}` : ""),
          qty: l.quantity,
          amount: l.priceMinor * l.quantity,
          currency: l.currency,
        }))}
      />

      {step === 3 && order.dueNow > 0 && (
        <p className="mt-4 text-center text-[12px] font-semibold text-[var(--muted)]">
          {t("checkout.submitHint", { amount: money(order.dueNow, currency) })}
        </p>
      )}

      {place.submitError && (
        <p className="mt-4 rounded-[var(--r-card)] border border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-[13px] font-bold text-[var(--danger)] shadow-[0_8px_24px_-12px_var(--shadow)]">
          {place.submitError}
          {place.limitCode === "TOO_MANY_UNPAID" && (
            <>
              {" "}
              <Link href="/account" className="underline">
                {t("checkout.toOrders")}
              </Link>
            </>
          )}
        </p>
      )}

      {/* spacer so content never hides behind the sticky bar */}
      <div aria-hidden className="h-24" />

      <CheckoutBottomBar
        step={step}
        keyboardOpen={keyboardOpen}
        submitting={place.submitting}
        stepOk={stepOk}
        primaryLabel={primaryLabel}
        onBack={back}
        onNext={next}
      />
    </div>
  );
}
