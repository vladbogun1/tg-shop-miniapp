"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatPhone, isValidPhone } from "@shop/core/phone";
import type { OrderField } from "@shop/customer/checkout/order-request";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";
import { confirmGiftLine } from "../model/totals";
import dynamic from "next/dynamic";
import { ContactsStep } from "./ContactsStep";
import type { useCheckoutForm } from "./use-checkout-form";
import type { useCheckoutOrder } from "./use-checkout-order";

function StepLoading() {
  return <div className="shimmer h-48 rounded-[var(--r-card)]" />;
}

// Steps 2–4 load after the first one is on screen: /checkout opens on the contacts (bundle budget, iOS).
const DeliveryStep = dynamic(() => import("./DeliveryStep").then((m) => m.DeliveryStep), { loading: StepLoading });
const PaymentStep = dynamic(() => import("./PaymentStep").then((m) => m.PaymentStep), { loading: StepLoading });
const ConfirmStep = dynamic(() => import("./ConfirmStep").then((m) => m.ConfirmStep), { loading: StepLoading });

type Form = ReturnType<typeof useCheckoutForm>;
type Order = ReturnType<typeof useCheckoutOrder>;

/** The four steps with the slide animation between them. */
export function CheckoutSteps({
  step,
  touched,
  form,
  order,
  promoCode,
  subtotal,
  currency,
  items,
  estimate,
  serverField,
  onFieldEdit,
}: {
  step: number;
  touched: boolean;
  form: Form;
  order: Order;
  promoCode: string;
  subtotal: number;
  currency: string;
  items: { title: string; qty: number; amount: number; currency: string }[];
  /** Field the server rejected (see usePlaceOrder.fieldError) and the reset when the customer edits it. */
  serverField: OrderField | null;
  /** «≈ N ₴» from Nova Poshta (never blocks the order). */
  estimate: { estimate: NpEstimateResponse | null; loading: boolean };
  onFieldEdit: () => void;
}) {
  const t = useT();
  const { d } = form;
  const { giftTier, promoPreview } = order;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={spring}
      >
        {step === 0 && (
          <ContactsStep
            recipient={d.recipient}
            phone={form.phone}
            touched={touched}
            phoneOk={isValidPhone(form.phone)}
            onRecipient={(r) => {
              onFieldEdit();
              d.setRecipient(r);
            }}
            onPhone={(v) => {
              onFieldEdit();
              form.setPhone(v);
            }}
            prefilled={form.prefilled}
            serverField={serverField}
            latinAllowed={d.draft.tab === "PICKUP"}
          />
        )}
        {step === 1 && (
          <DeliveryStep
            d={d}
            tabs={form.tabs}
            mode={form.npMode}
            setMode={form.setNpMode}
            estimate={estimate}
            currency={currency}
            payOnDelivery={order.payOnDelivery > 0}
            comment={form.comment}
            setComment={form.setComment}
            touched={touched}
          />
        )}
        {step === 2 && (
          <PaymentStep
            options={order.paymentOptions}
            loading={order.paymentQuery.isLoading}
            error={order.paymentQuery.isError}
            selected={order.chosenPaymentId}
            onSelect={order.setPaymentId}
            currency={currency}
            noneForDelivery={order.noneForDelivery}
            switched={order.paymentSwitched}
          />
        )}
        {step === 3 && (
          <ConfirmStep
            draft={d.draft}
            phone={formatPhone(form.phone)}
            estimate={estimate.estimate}
            onDelivery={order.onDelivery}
            comment={form.comment}
            payment={order.chosenPayment}
            promoCode={promoCode}
            promoMessage={promoPreview && !promoPreview.valid ? promoPreview.message ?? null : null}
            subtotal={subtotal}
            discount={order.discount}
            gift={confirmGiftLine(order.gift, giftTier, order.giftDiscount, t)}
            giftTier={giftTier && giftTier.guaranteedPercent > 0 ? giftTier : null}
            giftChoice={order.giftChoice}
            onGiftChoice={order.setGiftChoice}
            giftDiscount={order.giftDiscount}
            baseTotal={order.baseTotal}
            total={order.total}
            dueNow={order.dueNow}
            currency={currency}
            items={items}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
