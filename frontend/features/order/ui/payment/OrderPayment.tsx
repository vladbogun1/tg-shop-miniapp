"use client";

/**
 * Online payment (monobank) on the order page.
 *
 * States, from what the server says about the order:
 *   - AWAITING: the amount due, the deadline with a countdown and a big "Оплатити {amount}" button
 *     (plus the failure reason when the last attempt failed);
 *   - checking: "Перевіряємо оплату…" while the bank is processing / right after coming back;
 *   - paid: amount, card / Apple Pay / Google Pay / monobank, the cash-on-delivery rest for a
 *     prepayment, and "we will confirm" while the order is NEW;
 *   - online payment switched off on the server: a notice instead of the button.
 * A PAYMENT_TIMEOUT cancellation is shown by the page in the status section (it replaces the
 * reject reason), so this block renders nothing then.
 *
 * Paying: "Оплатити" opens the regular monobank page in the phone's REAL browser (Chrome on Android
 * via WebApp.openLink try_browser, the default browser on iOS). Google Pay / Apple Pay only work there.
 * After paying, monobank sends that browser to /pay-return, which opens the Mini App again on this
 * order. If the customer comes back by hand, the order is re-read every 3 s for up to a minute while
 * the payment is still created / processing / hold (use-payment-flow). «Оплата не відкрилася?» opens
 * the same page in Telegram's browser. Nothing opens by itself: straight from checkout
 * (`?created=1`) the block reads «Замовлення #… створено» with «Оплатити» and «Скасувати».
 */
import { needsTopUp } from "@shop/core/orders";
import { IN_FLIGHT } from "@shop/customer/payment/model";
import type { OrderDetail } from "@/lib/api";
import { CheckingCard, PaidCard, UnavailableCard } from "./PaymentCards";
import { AwaitingCard } from "./AwaitingCard";
import { usePaymentFlow } from "./use-payment-flow";

export function OrderPayment({
  order,
  onOrder,
  onRefetch,
  created = false,
  onCancel,
}: {
  order: OrderDetail;
  /** A fresher copy of the order (from /payment/refresh) — put it in the query cache. */
  onOrder: (o: OrderDetail) => void;
  /** Re-read the order (its payability changed under us). */
  onRefetch: () => void;
  /** Just placed (arrived from checkout with `?created=1`): "order #… created" heading. */
  created?: boolean;
  /** Shows «Скасувати замовлення» under «Оплатити» (opens the page's cancel dialog). */
  onCancel?: () => void;
}) {
  const flow = usePaymentFlow({ order, onOrder, onRefetch });
  const { state, topUp, status } = flow;

  if (order.paid && !needsTopUp(order)) return <PaidCard order={order} partial={state === "PARTIAL"} />;
  if (state !== "AWAITING" && !topUp) return null;
  if (!order.payment.enabled) return <UnavailableCard />;
  if (flow.returning || IN_FLIGHT.includes(status)) {
    return <CheckingCard spinning={flow.returning || flow.watching} onCheckAgain={() => flow.watch(true)} />;
  }

  return <AwaitingCard order={order} flow={flow} created={created} onCancel={onCancel} />;
}
