"use client";

/**
 * Online payment (monobank acquiring) of an order — the block on the order page.
 *
 * Payment is online only: POST /api/me/orders/{id}/payment opens a monobank invoice for what is due
 * now (the whole order or the prepayment) and the browser goes to monobank's hosted page (card,
 * Apple Pay, Google Pay, the mono app). monobank sends the customer back to the order page with
 * `?payment=return`; the webhook may lag, so the page asks POST .../payment/refresh every 3 s for up
 * to a minute. Unpaid orders are cancelled by the server after `paymentDueAt` (PAYMENT_TIMEOUT).
 * A paid order stays NEW until an admin confirms it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, CreditCard, Loader2, ShieldCheck, Truck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { codMinor, paymentState, type OnlinePayment, type OrderDetail } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { TFunction } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";

// ---- starting a payment ------------------------------------------------------------------------

/** Opens a monobank invoice and sends the browser to its page. Throws ApiError when it can't. */
export async function goToPayment(orderId: string, locale: string): Promise<void> {
  const start = await api.startPayment(orderId, locale);
  window.location.assign(start.pageUrl);
}

/**
 * The checkout navigates to the order page when the payment could not be started; the reason is
 * handed over in memory (client-side navigation keeps modules alive) and shown once there.
 */
let pendingStartError: { orderId: string; message: string } | null = null;

export function rememberPaymentError(orderId: string, message: string): void {
  pendingStartError = { orderId, message };
}

function takePaymentError(orderId: string): string | null {
  if (pendingStartError?.orderId !== orderId) return null;
  const { message } = pendingStartError;
  pendingStartError = null;
  return message;
}

/**
 * Back from monobank via the browser's Back button: the page comes out of the bfcache exactly as it
 * was left — with a spinner on the pay button. `onRestore` puts it right.
 */
export function usePageRestore(onRestore: () => void): void {
  const cb = useRef(onRestore);
  useEffect(() => {
    cb.current = onRestore;
  });
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) cb.current();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
}

// ---- helpers -----------------------------------------------------------------------------------

/** Set automatically by the server when the order was not paid in time (not in the shared type yet). */
export function isPaymentTimeout(order: OrderDetail): boolean {
  return (order as OrderDetail & { rejectReasonCode?: string | null }).rejectReasonCode === "PAYMENT_TIMEOUT";
}

/** "Картка •• 1902", "Apple Pay •• 1902", "monobank" — how the money arrived. */
export function paymentMethodLabel(p: OnlinePayment, t: TFunction): string | null {
  const last4 = p.maskedPan?.replace(/\D/g, "").slice(-4) || null;
  const name =
    p.paymentMethod === "apple"
      ? "Apple Pay"
      : p.paymentMethod === "google"
        ? "Google Pay"
        : p.paymentMethod === "monobank"
          ? "monobank"
          : p.paymentMethod === "wallet"
            ? t("pay.method.wallet")
            : p.paymentMethod || last4
              ? t("pay.method.card")
              : null;
  if (!name) return null;
  return last4 && p.paymentMethod !== "monobank" ? `${name} •• ${last4}` : name;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Current time, ticking every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const IN_FLIGHT = new Set(["processing", "hold"]);
const FINAL = new Set(["success", "failure", "expired", "reversed"]);
const POLL_EVERY_MS = 3_000;
const POLL_FOR_MS = 60_000;
/** Back from monobank but the invoice is still just "created": the customer left without paying. */
const GIVE_UP_UNPAID_MS = 15_000;

// ---- the block ---------------------------------------------------------------------------------

export function OrderPayment({ order, onRefetch }: { order: OrderDetail; onRefetch: () => void }) {
  const { t, href, locale } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const qc = useQueryClient();
  const p = order.payment;

  /** `?payment=return` is still in the address bar. */
  const [returnParam, setReturnParam] = useState(false);
  /** Came back from monobank (or it said a payment is in progress): check the status. */
  const [returning, setReturning] = useState(false);
  /** Polling ran out while the bank was still processing. */
  const [stalled, setStalled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get("payment") === "return";
    setReturnParam(back);
    setReturning(back);
    const pending = takePaymentError(order.id);
    if (pending) setErr(pending);
  }, [order.id]);

  usePageRestore(() => {
    setStarting(false);
    onRefetch();
  });

  const inFlight = IN_FLIGHT.has(p.status);
  const shouldCheck = !order.paid && order.status !== "REJECTED" && (returning || inFlight) && !stalled;

  // The latest order setter, without restarting the polling loop on every render.
  const apply = useRef<(d: OrderDetail) => void>(() => {});
  useEffect(() => {
    apply.current = (d) => {
      qc.setQueryData(["me", "orders", order.id, locale], d);
      void qc.invalidateQueries({ queryKey: ["me", "orders"], exact: true });
    };
  });

  useEffect(() => {
    if (!shouldCheck) return;
    let cancelled = false;
    let timer = 0;
    const started = Date.now();
    const tick = async () => {
      let d: OrderDetail | null = null;
      try {
        d = await api.refreshPayment(order.id);
      } catch {
        /* throttled or offline — the next tick tries again */
      }
      if (cancelled) return;
      if (d) apply.current(d);
      const elapsed = Date.now() - started;
      const s = d?.payment.status;
      const settled =
        !!d &&
        (d.paid ||
          d.status === "REJECTED" ||
          (s !== undefined && FINAL.has(s)) ||
          ((s === "created" || s === "none") && elapsed >= GIVE_UP_UNPAID_MS));
      if (settled || elapsed >= POLL_FOR_MS) {
        setReturning(false);
        if (!settled) setStalled(true);
        return;
      }
      timer = window.setTimeout(tick, POLL_EVERY_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shouldCheck, order.id]);

  // Done checking: drop `?payment=return`, so a reload does not start it again.
  useEffect(() => {
    if (!returnParam || shouldCheck) return;
    setReturnParam(false);
    setReturning(false);
    router.replace(href(`/account/orders/${order.id}`), { scroll: false });
  }, [returnParam, shouldCheck, router, href, order.id]);

  const dueAt = order.paymentDueAt ? Date.parse(order.paymentDueAt) : NaN;
  const awaiting = paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const now = useNow(awaiting && !Number.isNaN(dueAt));

  async function pay() {
    setStarting(true);
    setErr(null);
    try {
      await goToPayment(order.id, locale);
      // The browser is leaving for monobank; keep the spinner until it does.
    } catch (e) {
      setStarting(false);
      if (e instanceof ApiError && e.code === "PAYMENT_IN_PROGRESS") {
        setStalled(false);
        setReturning(true);
        return;
      }
      setErr(e instanceof ApiError ? e.message : t("pay.startFailed"));
      if (e instanceof ApiError && e.code !== "PAYMENT_FAILED") onRefetch();
    }
  }

  // ---- states ----

  if (order.status === "REJECTED") {
    if (!isPaymentTimeout(order)) return null;
    return (
      <Notice tone="danger" icon={<Ban className="h-5 w-5" strokeWidth={2} />} title={t("pay.timeout")} text={t("pay.timeoutText")}>
        <ButtonLink href={href("/catalog")} variant="surface" size="sm" className="mt-3">
          {t("common.toCatalog")}
        </ButtonLink>
      </Notice>
    );
  }

  if (order.paid) {
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

  if (shouldCheck) {
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

  if (stalled && inFlight) {
    return (
      <Notice tone="warn" icon={<Clock className="h-5 w-5" strokeWidth={2} />} text={t("pay.stillProcessing")}>
        <Button type="button" variant="surface" size="sm" className="mt-3" onClick={() => setStalled(false)}>
          {t("pay.checkAgain")}
        </Button>
      </Notice>
    );
  }

  if (!awaiting) {
    return p.status === "reversed" ? <Notice tone="warn" icon={<TriangleAlert className="h-5 w-5" strokeWidth={2} />} text={t("pay.reversed")} /> : null;
  }

  const left = Number.isNaN(dueAt) ? null : dueAt - now;
  if (left !== null && left <= 0) {
    return <Notice tone="danger" icon={<Clock className="h-5 w-5" strokeWidth={2} />} text={t("pay.expired")} />;
  }

  if (!p.enabled) {
    return (
      <Notice
        tone="warn"
        icon={<TriangleAlert className="h-5 w-5" strokeWidth={2} />}
        title={t("pay.unavailable")}
        text={t("pay.unavailableText")}
      />
    );
  }

  const afterPayment = order.totalMinor - order.receivedMinor - order.amountDueMinor;
  const failed = p.status === "failure";

  return (
    <section className="nb hud-frame p-5 sm:p-6">
      <h3 className="eyebrow mb-4 flex items-center gap-2 text-[11px]">
        <CreditCard className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} /> {t("order.payment")}
      </h3>
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
            <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
              {t("pay.until", { time: fmt.dateTime(order.paymentDueAt) })}
            </p>
          </div>
        )}
      </div>
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
        onClick={() => void pay()}
      >
        {t("pay.button", { amount: fmt.money(order.amountDueMinor, order.currency) })}
      </Button>
      <PaymentTrust className="mt-3 justify-center" />
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

const TONE = {
  danger: "var(--danger)",
  warn: "var(--warn)",
} as const;

function Notice({
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
