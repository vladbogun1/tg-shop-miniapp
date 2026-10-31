"use client";

/**
 * Online payment (monobank acquiring) of an order — the block on the order page.
 *
 * Payment is online only: POST /api/me/orders/{id}/payment (display IFRAME) opens a monobank invoice
 * for what is due now (the whole order or the prepayment) and its form (card, Apple Pay, Google Pay,
 * the mono app) is shown in PaymentModal over this page. The checkout lands here with `?created=1`:
 * the block then reads «Замовлення #… створено» with the amount, the countdown, «Оплатити» and
 * «Скасувати» — the form is NOT opened by itself. The status check after returning from the bank
 * lives in ../queries (`usePaymentCheck`). Unpaid orders are cancelled by the server after
 * `paymentDueAt` (PAYMENT_TIMEOUT). A paid order stays NEW until an admin confirms it.
 */
import { Ban, Clock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { needsTopUp, paymentState } from "@shop/core/orders";
import { type OrderDetail } from "@shop/core/types";
import { Button } from "@shop/ui/primitives";
import { toast } from "@shop/ui/toast";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { isPaymentTimeout } from "../model/helpers";
import { useNow, usePageRestore, usePaymentCheck, useScrollTopWhenPaid } from "../queries";
import { PaymentModal, type PaymentModalClose } from "./PaymentModal";
import { AwaitingCard, CheckingCard, Notice, PaidCard } from "./PaymentStates";

export function OrderPayment({
  order,
  onRefetch,
  created = false,
  onCancel,
}: {
  order: OrderDetail;
  onRefetch: () => void;
  /** Just placed (the checkout landed here): "order #… created" heading. */
  created?: boolean;
  /** Shows «Скасувати замовлення» next to «Оплатити» (opens the cancel dialog of the page). */
  onCancel?: () => void;
}) {
  const { t, locale } = useI18n();
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** The monobank form (the framed invoice page) shown in the modal; null = closed. */
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const check = usePaymentCheck(order, !!payUrl);
  const { apply, setStalled, setReturning } = check;

  usePageRestore(() => {
    setStarting(false);
    onRefetch();
  });
  useScrollTopWhenPaid(order.paid);

  async function pay() {
    setStarting(true);
    setErr(null);
    try {
      const start = await api.startPayment(order.id, locale, "IFRAME");
      setPayUrl(start.pageUrl);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PAYMENT_IN_PROGRESS") {
        setStalled(false);
        setReturning(true);
        return;
      }
      setErr(e instanceof ApiError ? e.message : t("pay.startFailed"));
      if (e instanceof ApiError && e.code !== "PAYMENT_FAILED") onRefetch();
    } finally {
      setStarting(false);
    }
  }

  function onModalClose(why: PaymentModalClose) {
    setPayUrl(null);
    if (why === "paid") {
      toast.success(t("pay.received"));
      return;
    }
    if (why === "check") {
      // The form says it is done (or "back" was pressed in it): check the status for a short while.
      setStalled(false);
      setReturning(true);
      return;
    }
    // Closed with ✕ / Esc: one quiet look at the status, without the "checking" screen.
    api.refreshPayment(order.id).then(
      (d) => apply.current(d),
      () => onRefetch()
    );
  }

  return (
    <>
      <PaymentState
        order={order}
        created={created}
        checking={check.shouldCheck}
        stalled={check.stalled && check.inFlight}
        onCheckAgain={() => setStalled(false)}
        err={err}
        starting={starting}
        onPay={() => void pay()}
        onCancel={onCancel}
      />
      <PaymentModal order={order} pageUrl={payUrl} onOrder={(d) => apply.current(d)} onClose={onModalClose} />
    </>
  );
}

interface StateProps {
  order: OrderDetail;
  created: boolean;
  checking: boolean;
  stalled: boolean;
  onCheckAgain: () => void;
  err: string | null;
  starting: boolean;
  onPay: () => void;
  onCancel?: () => void;
}

/** Which card the block shows: timeout / paid / checking / stalled / awaiting payment / nothing. */
function PaymentState(props: StateProps) {
  const { t } = useI18n();
  const { order } = props;
  const topUp = needsTopUp(order);
  const awaiting = (paymentState(order) === "AWAITING" || topUp) && order.amountDueMinor > 0;

  if (order.status === "REJECTED") return isPaymentTimeout(order) ? <TimeoutNotice /> : null;
  if (order.paid && !topUp) return <PaidCard order={order} />;
  if (props.checking) return <CheckingCard />;
  if (props.stalled) {
    return (
      <Notice tone="warn" icon={<Clock className="h-5 w-5" strokeWidth={2} />} text={t("pay.stillProcessing")}>
        <Button type="button" variant="surface" size="sm" className="mt-3" onClick={props.onCheckAgain}>
          {t("pay.checkAgain")}
        </Button>
      </Notice>
    );
  }
  if (awaiting) return <AwaitingState {...props} topUp={topUp} />;
  return order.payment.status === "reversed" ? (
    <Notice tone="warn" icon={<TriangleAlert className="h-5 w-5" strokeWidth={2} />} text={t("pay.reversed")} />
  ) : null;
}

/** An amount is due: the deadline countdown, then «Оплатити» (or "expired" / "unavailable"). */
function AwaitingState({ order, created, topUp, err, starting, onPay, onCancel }: StateProps & { topUp: boolean }) {
  const { t } = useI18n();
  // The deadline binds a NEW order only: once the shop approved it, paying late is fine until the
  // shop cancels the order itself (they may have agreed in the chat).
  const dueAt = order.paymentDueAt && order.status === "NEW" && !order.paid ? Date.parse(order.paymentDueAt) : NaN;
  const now = useNow(!Number.isNaN(dueAt));
  const left = Number.isNaN(dueAt) ? null : dueAt - now;
  if (left !== null && left <= 0) {
    return <Notice tone="danger" icon={<Clock className="h-5 w-5" strokeWidth={2} />} text={t("pay.expired")} />;
  }
  if (!order.payment.enabled) {
    return (
      <Notice
        tone="warn"
        icon={<TriangleAlert className="h-5 w-5" strokeWidth={2} />}
        title={t("pay.unavailable")}
        text={t("pay.unavailableText")}
      />
    );
  }
  return <AwaitingCard order={order} created={created} topUp={topUp} left={left} err={err} starting={starting} onPay={onPay} onCancel={onCancel} />;
}

function TimeoutNotice() {
  const { t, href } = useI18n();
  return (
    <Notice tone="danger" icon={<Ban className="h-5 w-5" strokeWidth={2} />} title={t("pay.timeout")} text={t("pay.timeoutText")}>
      <ButtonLink href={href("/catalog")} variant="surface" size="sm" className="mt-3">
        {t("common.toCatalog")}
      </ButtonLink>
    </Notice>
  );
}
