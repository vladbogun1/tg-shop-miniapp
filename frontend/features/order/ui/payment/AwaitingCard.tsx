"use client";

import type { OrderDetail } from "@/lib/api";
import { AmountBlock, Card, CreatedHeading, DeadlineLine, FailureNote, PayActions } from "./PaymentCards";
import type { usePaymentFlow } from "./use-payment-flow";

/** The block while the customer still has to pay: amount, deadline, failure note, the buttons. */
export function AwaitingCard({
  order,
  flow,
  created,
  onCancel,
}: {
  order: OrderDetail;
  flow: ReturnType<typeof usePaymentFlow>;
  created: boolean;
  onCancel?: () => void;
}) {
  const { topUp, status } = flow;
  const failed = status === "failure";
  return (
    <Card tone="accent">
      {created && <CreatedHeading orderId={order.id} />}
      <AmountBlock order={order} topUp={topUp} />
      {order.paymentDueAt && flow.dueAt !== null && (
        <DeadlineLine paymentDueAt={order.paymentDueAt} dueAt={flow.dueAt} now={flow.now} timeUp={flow.timeUp} />
      )}
      {failed && <FailureNote reason={order.payment.failureReason} />}
      {!flow.timeUp && (
        <PayActions
          order={order}
          topUp={topUp}
          failed={failed}
          paying={flow.paying}
          notOpened={flow.notOpened}
          onPay={(system) => void flow.pay(system)}
          onCancel={onCancel}
        />
      )}
      {flow.payError && <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{flow.payError}</p>}
    </Card>
  );
}
