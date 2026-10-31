"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatPhone, isValidPhone } from "@shop/core/phone";
import { isValidCustomerName } from "@shop/customer/checkout/order-request";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";
import { confirmGiftLine } from "../model/totals";
import { ConfirmStep } from "./ConfirmStep";
import { ContactsStep } from "./ContactsStep";
import { DeliveryStep } from "./DeliveryStep";
import { PaymentStep } from "./PaymentStep";
import type { useCheckoutForm } from "./use-checkout-form";
import type { useCheckoutOrder } from "./use-checkout-order";

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
}: {
  step: number;
  touched: boolean;
  form: Form;
  order: Order;
  promoCode: string;
  subtotal: number;
  currency: string;
  items: { title: string; qty: number; amount: number; currency: string }[];
}) {
  const t = useT();
  const { np } = form;
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
            name={form.name}
            phone={form.phone}
            touched={touched}
            nameOk={isValidCustomerName(form.name)}
            phoneOk={isValidPhone(form.phone)}
            onName={form.setName}
            onPhone={form.setPhone}
            prefilled={form.prefilled}
          />
        )}
        {step === 1 && (
          <DeliveryStep
            delivery={form.delivery}
            setDelivery={form.chooseDelivery}
            city={np.city}
            onCity={np.chooseCity}
            warehouse={np.warehouse}
            onWarehouse={np.chooseWarehouse}
            fromLast={np.warehouseFromLast}
            onChangeLast={() => {
              np.touched.current = true;
              np.setWarehouseFromLast(false);
            }}
            mode={form.npMode}
            setMode={form.setNpMode}
            focus={np.focus}
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
          />
        )}
        {step === 3 && (
          <ConfirmStep
            name={form.name}
            phone={formatPhone(form.phone)}
            delivery={form.delivery}
            warehouse={np.warehouse}
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
