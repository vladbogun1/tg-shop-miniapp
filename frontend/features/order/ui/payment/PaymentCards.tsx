"use client";

import { motion } from "framer-motion";
import { Ban, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { codMinor } from "@shop/core/orders";
import { shortOrderId } from "@shop/core/format";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
import { leftText, methodLabel } from "../../model/payment-labels";

const TONE_CLASS = {
  ok: "nb p-4 border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_12%,var(--surface))]",
  warn: "nb p-4 border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface))]",
  accent: "nb hud-frame p-4 border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
} as const;

export function Card({ tone, children }: { tone: keyof typeof TONE_CLASS; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={TONE_CLASS[tone]}
    >
      {children}
    </motion.div>
  );
}

/** Paid: amount, how, the cash-on-delivery rest of a prepayment, "we will confirm" while NEW. */
export function PaidCard({ order, partial }: { order: OrderDetail; partial: boolean }) {
  const { t } = useI18n();
  const received = order.receivedMinor > 0 ? order.receivedMinor : order.totalMinor;
  const method = methodLabel(order, t);
  const rest = partial ? codMinor(order) : 0;
  return (
    <Card tone="ok">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ok)]" strokeWidth={2.25} />
        <div className="min-w-0 flex-1">
          <p className="nb-up text-[14px] font-bold text-[var(--ok)]">
            {t("pay.paid", { amount: money(received, order.currency) })}
          </p>
          {method && <p className="mt-0.5 text-[13px] text-[var(--ink)]">{method}</p>}
          {rest > 0 && (
            <p className="font-display mt-2 text-[14px] font-bold tabular-nums text-[var(--ink)]">
              {t("pay.cod", { amount: money(rest, order.currency) })}
            </p>
          )}
          {order.status === "NEW" && <p className="mt-1.5 text-[12px] text-[var(--muted)]">{t("pay.willConfirm")}</p>}
        </div>
      </div>
    </Card>
  );
}

/** Online payment switched off on the server. */
export function UnavailableCard() {
  const { t } = useI18n();
  return (
    <Card tone="warn">
      <div className="flex items-start gap-2.5">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" strokeWidth={2.25} />
        <div>
          <p className="nb-up text-[14px] font-bold text-[var(--warn)]">{t("pay.unavailable")}</p>
          <p className="mt-1 text-[12px] text-[var(--ink)]">{t("pay.unavailableText")}</p>
        </div>
      </div>
    </Card>
  );
}

/** The bank is deciding / just came back. */
export function CheckingCard({ spinning, onCheckAgain }: { spinning: boolean; onCheckAgain: () => void }) {
  const { t } = useI18n();
  return (
    <Card tone="warn">
      <div className="flex items-start gap-2.5">
        {spinning ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--warn)]" strokeWidth={2.5} />
        ) : (
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" strokeWidth={2.25} />
        )}
        <div className="min-w-0 flex-1">
          <p className="nb-up text-[14px] font-bold text-[var(--warn)]">{t("pay.checking")}</p>
          <p className="mt-1 text-[12px] text-[var(--ink)]">
            {spinning ? t("pay.checkingText") : t("pay.stillProcessing")}
          </p>
          {!spinning && (
            <Button
              size="sm"
              className="mt-3"
              icon={<RefreshCw className="h-4 w-4" strokeWidth={2.5} />}
              onClick={() => {
                haptic();
                onCheckAgain();
              }}
            >
              {t("pay.checkAgain")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** "Order #... created" heading, straight from checkout. */
export function CreatedHeading({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-3 border-b border-[var(--line)] pb-3">
      <p className="nb-up flex items-center gap-2 text-[16px] font-extrabold text-[var(--ok)]">
        <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
        {t("created.title", { id: shortOrderId(orderId) })}
      </p>
      <p className="mt-1 text-[12px] text-[var(--muted)]">{t("created.text")}</p>
    </div>
  );
}

/** The amount due and what it is for (top-up / exchange / prepayment). */
export function AmountBlock({ order, topUp }: { order: OrderDetail; topUp: boolean }) {
  const { t } = useI18n();
  const due = order.amountDueMinor;
  // What is left for the courier once this payment arrives (prepayment orders).
  const restOnDelivery = Math.max(0, codMinor(order) - due);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">
          <CreditCard className="h-4 w-4" strokeWidth={2.25} /> {t(topUp ? "pay.topUpTitle" : "pay.title")}
        </h3>
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          {t("pay.due")}
        </span>
      </div>
      <p className="font-display mt-1 text-right text-[26px] font-bold leading-tight tabular-nums text-[var(--accent)]">
        {money(due, order.currency)}
      </p>
      {topUp && (
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {t(order.exchangeOfId ? "pay.exchangeText" : "pay.topUpText", {
            paid: money(order.receivedMinor, order.currency),
          })}
        </p>
      )}
      {restOnDelivery > 0 && (
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {t("pay.prepayment", { amount: money(restOnDelivery, order.currency) })}
        </p>
      )}
    </>
  );
}

/** "Pay until ... left ...", or "time is up". */
export function DeadlineLine({
  paymentDueAt,
  dueAt,
  now,
  timeUp,
}: {
  paymentDueAt: string;
  dueAt: number;
  now: number;
  timeUp: boolean;
}) {
  const { t } = useI18n();
  return (
    <p className="mt-3 text-[13px] font-semibold text-[var(--ink)]">
      {timeUp ? (
        <span className="text-[var(--danger)]">{t("pay.timeUp")}</span>
      ) : (
        <>
          {t("pay.until", { when: formatDateTime(paymentDueAt) })}
          <span className="text-[var(--warn)]">
            {" · "}
            {t("pay.left", { time: leftText(dueAt - now, t) })}
          </span>
        </>
      )}
    </p>
  );
}

/** Why the last attempt failed. */
export function FailureNote({ reason }: { reason: string | null | undefined }) {
  const { t } = useI18n();
  return (
    <p className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-3 py-2 text-[12px] font-semibold text-[var(--ink)]">
      {reason ? t("pay.failed", { reason }) : t("pay.failedGeneric")}
    </p>
  );
}

const FALLBACK_BIG =
  "tap nb-press mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--accent)] text-[13px] font-semibold text-[var(--accent)] disabled:opacity-60";
const FALLBACK_SMALL =
  "tap mt-1 flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-60";

/** «Оплатити», the Telegram-browser fallback and «Скасувати замовлення». */
export function PayActions({
  order,
  topUp,
  failed,
  paying,
  notOpened,
  onPay,
  onCancel,
}: {
  order: OrderDetail;
  topUp: boolean;
  failed: boolean;
  paying: "browser" | "telegram" | null;
  notOpened: boolean;
  onPay: (system: boolean) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const amount = money(order.amountDueMinor, order.currency);
  const label = failed ? t("pay.retry", { amount }) : t(topUp ? "pay.topUpButton" : "pay.button", { amount });
  return (
    <>
      <Button
        variant="accent"
        fullWidth
        className="mt-4"
        loading={paying === "browser"}
        icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
        onClick={() => void onPay(true)}
      >
        {label}
      </Button>
      <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[var(--muted)]">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--ok)]" strokeWidth={2.5} />
        {t("pay.hint")}
      </p>
      <button
        type="button"
        disabled={paying !== null}
        onClick={() => void onPay(false)}
        className={notOpened ? FALLBACK_BIG : FALLBACK_SMALL}
      >
        {paying === "telegram" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.5} />
        ) : (
          <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        )}
        <span className="text-left underline decoration-[var(--line-strong)] underline-offset-4">
          {t("pay.openFallback")}
        </span>
      </button>
      {onCancel && !topUp && (
        <button
          type="button"
          onClick={() => {
            haptic();
            onCancel();
          }}
          className="font-display tap nb-press mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-transparent text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--danger)]"
        >
          <Ban className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.button")}
        </button>
      )}
    </>
  );
}
