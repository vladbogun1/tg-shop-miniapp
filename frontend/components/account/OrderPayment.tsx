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
 * via WebApp.openLink try_browser, the default browser on iOS). Google Pay / Apple Pay only work there: inside
 * Telegram (an iframe in the Mini App, or Telegram's own in-app browser) pay.google.com answers
 * "Something went wrong". After paying, monobank sends that browser to /pay-return, which opens the
 * Mini App again on this order (startapp=view_<id>). If the customer comes back by hand instead,
 * {@link onAppResume} fires and the order is re-read every 3 s for up to a minute while the payment
 * is still created / processing / hold. The webhook usually gets there first; this is what makes
 * the screen catch up without a pull-to-refresh — and the fallback when a webhook is lost.
 * «Оплата не відкрилася?» opens the same page without try_browser (Telegram's browser: card or
 * monobank still work) — for phones without Chrome, where Telegram silently opens nothing; when
 * the Mini App is not hidden 2 s after the tap it is shown as a full button (`notOpened`).
 * Nothing opens by itself: straight from checkout (`?created=1`) the block reads
 * «Замовлення #… створено» with «Оплатити» and «Скасувати замовлення» (`created` / `onCancel`).
 */
import type { LooseT } from "@shop/core/i18n";
import { motion } from "framer-motion";
import { Ban, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { codMinor, needsTopUp, paymentState } from "@shop/core/orders";
import { shortOrderId } from "@shop/core/format";
import { awaitingOnline, IN_FLIGHT, PENDING, pendingPayment, POLL_EVERY_MS, POLL_FOR_MS } from "@shop/customer/payment/model";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { ApiError, customerApi, type OrderDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { money } from "@/lib/money";
import { nowMs } from "@shop/core/time";
import { spring } from "@/lib/motion";
import { haptic, hapticSuccess, isAndroidTelegram, onAppResume, openExternalLink } from "@/lib/telegram";

/** Re-renders every `ms` — for the "залишилось …" countdown. */
function useNow(ms: number): number {
  const [now, setNow] = useState(nowMs);
  useEffect(() => window.clearInterval.bind(window, window.setInterval(() => setNow(nowMs()), ms)), [ms]);
  return now;
}

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
  const { t, locale } = useI18n();
  /** The payment page is being created (which of the two buttons asked for it). */
  const [paying, setPaying] = useState<"browser" | "telegram" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  /** Android: Chrome was asked for but the Mini App never went to the background — no Chrome on
   *  this phone (Telegram then opens nothing). The Telegram-browser link is pushed forward. */
  const [notOpened, setNotOpened] = useState(false);
  /** The refresh loop is running. */
  const [watching, setWatching] = useState(false);
  /** Just came back from the payment page, the first answer is not in yet. */
  const [returning, setReturning] = useState(false);

  const orderRef = useRef(order);
  const onOrderRef = useRef(onOrder);
  useEffect(() => {
    orderRef.current = order;
    onOrderRef.current = onOrder;
  });
  /** The payment page was opened from this screen — a return is worth checking even if the
   *  cached order still says "none". */
  const opened = useRef(false);
  const running = useRef(false);
  const alive = useRef(true);
  const watchUntil = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  /** The page from the last tap — reopened right inside the next tap while it is still live. */
  const browserPage = useRef<{ url: string; expiresAt: number } | null>(null);
  /** One success haptic per payment, whichever loop sees it first. */
  const celebrated = useRef(false);
  const celebrate = useCallback(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    hapticSuccess();
    // The page leads with the paid block now — bring it into view.
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 120);
  }, []);

  const poll = useCallback(async () => {
    timer.current = undefined;
    let fresh: OrderDetail | null = null;
    try {
      fresh = await customerApi.refreshPayment(orderRef.current.id);
      if (alive.current) onOrderRef.current(fresh);
    } catch {
      /* offline for a moment — the next tick tries again */
    }
    if (!alive.current) return;
    setReturning(false);
    const o = fresh ?? orderRef.current;
    if (!pendingPayment(o) || nowMs() >= watchUntil.current) {
      running.current = false;
      setWatching(false);
      if (o.paid && !needsTopUp(o)) celebrate();
      return;
    }
    timer.current = window.setTimeout(() => void poll(), POLL_EVERY_MS);
  }, [celebrate]);

  /** Starts (or extends) the refresh loop. Several resume events for one return are harmless. */
  const watch = useCallback(
    (fromReturn: boolean) => {
      watchUntil.current = nowMs() + POLL_FOR_MS;
      if (fromReturn) setReturning(true);
      if (running.current) return;
      running.current = true;
      setWatching(true);
      void poll();
    },
    [poll]
  );

  useEffect(() => {
    alive.current = true;
    // Landed here with a payment already under way (straight from checkout, or from the bot's
    // message): catch up with the bank at once.
    if (pendingPayment(orderRef.current)) watch(false);
    const off = onAppResume(() => {
      const o = orderRef.current;
      if (awaitingOnline(o) && (opened.current || PENDING.includes(o.payment.status))) watch(true);
    });
    return () => {
      off();
      alive.current = false;
      running.current = false;
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [watch]);

  const now = useNow(30_000);
  const state = paymentState(order);
  /** Paid, then the shop added an item: the difference is paid here ("Доплатити"). */
  const topUp = needsTopUp(order);
  const status = order.payment.status;
  // The deadline binds a NEW order only: once the shop approved it, paying late is fine until the
  // shop cancels the order itself (they may have agreed in the chat).
  const dueAt = order.paymentDueAt && order.status === "NEW" && !order.paid ? new Date(order.paymentDueAt).getTime() : null;
  const timeUp = dueAt !== null && dueAt <= now;

  // The deadline passed while the screen was open: the server cancels the order — show that.
  const refetchedOnTimeUp = useRef(false);
  useEffect(() => {
    if (state === "AWAITING" && timeUp && !refetchedOnTimeUp.current) {
      refetchedOnTimeUp.current = true;
      onRefetch();
    }
  }, [state, timeUp, onRefetch]);

  /** A refusal of startPayment, handled the same way for both ways of paying. */
  function startFailed(e: unknown) {
    const code = e instanceof ApiError ? e.code : undefined;
    if (code === "PAYMENT_IN_PROGRESS") {
      watch(true);
    } else {
      setPayError(e instanceof ApiError ? e.message : t("pay.failedGeneric"));
      if (code === "NOT_PAYABLE" || code === "PAYMENT_EXPIRED" || code === "PAYMENT_UNAVAILABLE") {
        onRefetch();
      }
    }
  }

  /**
   * "Оплатити": the monobank page in the real browser (`system`), or — «Оплата не відкрилася?» — in
   * Telegram's own one. The Mini App keeps running underneath.
   */
  function openPage(url: string, system: boolean) {
    setNotOpened(false);
    openExternalLink(url, { systemBrowser: system });
    if (!system || !isAndroidTelegram()) return;
    // Chrome coming up hides the Mini App within a moment; still visible after 2 s = nothing opened.
    let hidden = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") hidden = true;
    };
    document.addEventListener("visibilitychange", onHide);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      if (!hidden && alive.current && document.visibilityState === "visible") setNotOpened(true);
    }, 2000);
  }

  async function pay(system: boolean) {
    if (paying) return;
    haptic();
    setPayError(null);
    // A live page is already known: open it right inside the tap. Telegram ignores an openLink that
    // comes too long after the last tap, so the fewer awaits the better.
    const known = browserPage.current;
    if (known && known.expiresAt - nowMs() > 60_000 && status === "created") {
      opened.current = true;
      openPage(known.url, system);
      return;
    }
    setPaying(system ? "browser" : "telegram");
    try {
      const started = await customerApi.startPayment(order.id, locale);
      if (!alive.current) return;
      browserPage.current = { url: started.pageUrl, expiresAt: new Date(started.expiresAt).getTime() };
      celebrated.current = false;
      opened.current = true;
      openPage(started.pageUrl, system);
    } catch (e) {
      startFailed(e);
    } finally {
      setPaying(null);
    }
  }

  // ---- paid ------------------------------------------------------------------------------------
  if (order.paid && !topUp) {
    const received = order.receivedMinor > 0 ? order.receivedMinor : order.totalMinor;
    const method = methodLabel(order, t);
    const rest = state === "PARTIAL" ? codMinor(order) : 0;
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
            {order.status === "NEW" && (
              <p className="mt-1.5 text-[12px] text-[var(--muted)]">{t("pay.willConfirm")}</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (state !== "AWAITING" && !topUp) return null;

  // ---- online payment switched off on the server -----------------------------------------------
  if (!order.payment.enabled) {
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

  // ---- the bank is deciding / just came back ---------------------------------------------------
  const inFlight = IN_FLIGHT.includes(status);
  if (returning || inFlight) {
    const spinning = returning || watching;
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
                  watch(true);
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

  // ---- awaiting payment ------------------------------------------------------------------------
  const due = order.amountDueMinor;
  // What is left for the courier once this payment arrives (prepayment orders).
  const restOnDelivery = Math.max(0, codMinor(order) - due);
  const failed = status === "failure";
  return (
    <Card tone="accent">
      {created && (
        <div className="mb-3 border-b border-[var(--line)] pb-3">
          <p className="nb-up flex items-center gap-2 text-[16px] font-extrabold text-[var(--ok)]">
            <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
            {t("created.title", { id: shortOrderId(order.id) })}
          </p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">{t("created.text")}</p>
        </div>
      )}
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

      {order.paymentDueAt && dueAt !== null && (
        <p className="mt-3 text-[13px] font-semibold text-[var(--ink)]">
          {timeUp ? (
            <span className="text-[var(--danger)]">{t("pay.timeUp")}</span>
          ) : (
            <>
              {t("pay.until", { when: formatDateTime(order.paymentDueAt) })}
              <span className="text-[var(--warn)]">
                {" · "}
                {t("pay.left", { time: leftText(dueAt! - now, t) })}
              </span>
            </>
          )}
        </p>
      )}

      {failed && (
        <p className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-3 py-2 text-[12px] font-semibold text-[var(--ink)]">
          {order.payment.failureReason
            ? t("pay.failed", { reason: order.payment.failureReason })
            : t("pay.failedGeneric")}
        </p>
      )}

      {!timeUp && (
        <>
          <Button
            variant="accent"
            fullWidth
            className="mt-4"
            loading={paying === "browser"}
            icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
            onClick={() => void pay(true)}
          >
            {failed
              ? t("pay.retry", { amount: money(due, order.currency) })
              : t(topUp ? "pay.topUpButton" : "pay.button", { amount: money(due, order.currency) })}
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[var(--muted)]">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--ok)]" strokeWidth={2.5} />
            {t("pay.hint")}
          </p>
          <button
            type="button"
            disabled={paying !== null}
            onClick={() => void pay(false)}
            className={
              notOpened
                ? "tap nb-press mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--accent)] text-[13px] font-semibold text-[var(--accent)] disabled:opacity-60"
                : "tap mt-1 flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-60"
            }
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
      )}

      {payError && <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{payError}</p>}
    </Card>
  );
}

function Card({ tone, children }: { tone: "ok" | "warn" | "accent"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "nb p-4 border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_12%,var(--surface))]"
      : tone === "warn"
        ? "nb p-4 border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface))]"
        : "nb hud-frame p-4 border-[color-mix(in_srgb,var(--accent)_45%,transparent)]";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className={cls}>
      {children}
    </motion.div>
  );
}

type T = LooseT;

/** "Картка •• 1902", "Apple Pay · •• 1902", "monobank" — or null when the money came otherwise. */
function methodLabel(order: OrderDetail, t: T): string | null {
  const p = order.payment;
  if (p.status !== "success") return null;
  const last4 = p.maskedPan ? p.maskedPan.replace(/\D/g, "").slice(-4) : "";
  const pan = last4 ? `•• ${last4}` : "";
  switch (p.paymentMethod) {
    case "apple":
      return [t("pay.method.apple"), pan].filter(Boolean).join(" · ");
    case "google":
      return [t("pay.method.google"), pan].filter(Boolean).join(" · ");
    case "monobank":
      return t("pay.method.monobank");
    default:
      return last4 ? t("pay.method.card", { last4 }) : null;
  }
}

function leftText(ms: number, t: T): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? t("pay.hm", { h, m }) : t("pay.m", { m });
}
