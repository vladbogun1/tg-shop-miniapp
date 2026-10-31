"use client";

/** Presentational states of the order's payment block (see OrderPayment). */
import { Ban, CheckCircle2, Clock, CreditCard, Loader2, ShieldCheck, Truck } from "lucide-react";
import { codMinor } from "@shop/core/orders";
import { shortOrderId } from "@shop/core/format";
import { type OrderDetail } from "@shop/core/types";
import { Button } from "@shop/ui/primitives";
import { ORDER_PAY_ANCHOR } from "@/features/gift/view/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";
import { countdown, paymentMethodLabel } from "../model/helpers";

const TONE = {
  danger: "var(--danger)",
  warn: "var(--warn)",
} as const;

export function Notice({
  tone,
  icon,
  title,
  text,
  children,
}: {
  tone: keyof typeof TONE;
  icon: React.ReactNode;
  title?: string;
  text: string;
  children?: React.ReactNode;
}) {
  const c = TONE[tone];
  return (
    <section
      className="nb flex items-start gap-3 p-5"
      style={{
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 10%, var(--surface))`,
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: c }}>
        {icon}
      </span>
      <div className="min-w-0">
        {title && (
          <p className="font-display text-[15px] font-bold uppercase tracking-[.06em]" style={{ color: c }}>
            {title}
          </p>
        )}
        <p className={`text-[13px] font-medium text-[var(--ink)] ${title ? "mt-1" : ""}`}>{text}</p>
        {children}
      </div>
    </section>
  );
}

/** "Оплата через monobank. Дані картки ми не бачимо." */
export function PaymentTrust({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] ${className ?? ""}`}>
      <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.25} />
      {t("checkout.pay.trust")}
    </p>
  );
}

export function PaidCard({ order }: { order: OrderDetail }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const p = order.payment;
  const received = order.receivedMinor > 0 ? order.receivedMinor : p.amountMinor;
  const method = paymentMethodLabel(p, t);
  const cod = codMinor(order);
  return (
    <section className="nb border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,var(--surface))] p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" strokeWidth={2} />
        <p className="font-display text-[16px] font-bold uppercase tracking-[.06em] text-[var(--ok)]">
          {t("pay.paid", { amount: fmt.money(received, order.currency) })}
        </p>
        {method && <span className="text-[13px] font-semibold text-[var(--muted)]">{method}</span>}
      </div>
      {cod > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] font-semibold text-[var(--ink)]">
          <Truck className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
          {t("pay.cod", { amount: fmt.money(cod, order.currency) })}
        </p>
      )}
      {order.status === "NEW" && <p className="mt-3 text-[13px] font-medium text-[var(--muted)]">{t("pay.confirmNote")}</p>}
    </section>
  );
}

export function CheckingCard() {
  const { t } = useI18n();
  return (
    <section className="nb flex items-start gap-3 p-5" aria-live="polite" aria-busy="true">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" strokeWidth={2.25} />
      <div>
        <p className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("pay.checking")}</p>
        <p className="mt-1 text-[13px] font-medium text-[var(--muted)]">{t("pay.checkingText")}</p>
      </div>
    </section>
  );
}

interface AwaitingProps {
  order: OrderDetail;
  created: boolean;
  topUp: boolean;
  /** ms left until the deadline; null = no deadline. */
  left: number | null;
  err: string | null;
  starting: boolean;
  onPay: () => void;
  onCancel?: () => void;
}

/** "Order created / pay the amount due": amount, countdown, «Оплатити», «Скасувати». */
export function AwaitingCard({ order, created, topUp, left, err, starting, onPay, onCancel }: AwaitingProps) {
  const { t } = useI18n();
  const fmt = useFmt();
  const p = order.payment;
  const afterPayment = order.totalMinor - order.receivedMinor - order.amountDueMinor;
  const failed = p.status === "failure";

  return (
    <section id={ORDER_PAY_ANCHOR} className="nb hud-frame scroll-mt-24 p-5 sm:p-6">
      {created ? (
        <div className="mb-4">
          <p className="flex items-center gap-2 font-display text-[18px] font-bold uppercase tracking-[.04em] text-[var(--ok)] sm:text-[20px]">
            <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
            {t("created.title", { id: shortOrderId(order.id) })}
          </p>
          <p className="mt-1 text-[13px] font-medium text-[var(--muted)]">{t("created.text")}</p>
        </div>
      ) : (
        <h3 className="eyebrow mb-4 flex items-center gap-2 text-[11px]">
          <CreditCard className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} /> {t(topUp ? "pay.topUpTitle" : "order.payment")}
        </h3>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[var(--muted)]">{t("pay.due")}</p>
          <p className="font-display text-[28px] font-bold leading-tight tabular-nums text-[var(--accent)]">
            {fmt.money(order.amountDueMinor, order.currency)}
          </p>
        </div>
        {left !== null && order.paymentDueAt && (
          <div className="text-right">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 font-display text-[13px] font-semibold tabular-nums tracking-[.04em] text-[var(--accent-hi)]">
              <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
              {t("pay.left", { time: countdown(left) })}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">{t("pay.until", { when: fmt.dateTime(order.paymentDueAt) })}</p>
          </div>
        )}
      </div>
      {topUp && (
        <p className="mt-2 text-[13px] font-semibold text-[var(--muted)]">
          {t(order.exchangeOfId ? "pay.exchangeText" : "pay.topUpText", {
            paid: fmt.money(order.receivedMinor, order.currency),
          })}
        </p>
      )}
      {afterPayment > 0 && (
        <p className="mt-2 text-[13px] font-semibold text-[var(--muted)]">
          {t("checkout.rest", { amount: fmt.money(afterPayment, order.currency) })}
        </p>
      )}

      {(failed || err) && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] font-medium text-[var(--danger)]"
        >
          {err ?? t("pay.failed", { reason: p.failureReason ? `: ${p.failureReason}` : "" })}
        </p>
      )}

      <Button
        type="button"
        variant="accent"
        size="lg"
        fullWidth
        className="mt-4"
        loading={starting}
        icon={<CreditCard className="h-4 w-4" strokeWidth={2.25} />}
        onClick={onPay}
      >
        {t(topUp ? "pay.topUpButton" : "pay.button", { amount: fmt.money(order.amountDueMinor, order.currency) })}
      </Button>
      {onCancel && !topUp && (
        <Button
          type="button"
          variant="surface"
          size="md"
          fullWidth
          className="mt-2"
          icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}
          onClick={onCancel}
        >
          {t("cancel.button")}
        </Button>
      )}
      <PaymentTrust className="mt-3 justify-center" />
    </section>
  );
}
