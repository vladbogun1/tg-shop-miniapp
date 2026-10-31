"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { needsTopUp, paymentState } from "@shop/core/orders";
import { awaitingOnline, PENDING, pendingPayment, POLL_EVERY_MS, POLL_FOR_MS } from "@shop/customer/payment/model";
import { useI18n } from "@/i18n/context";
import { ApiError, customerApi, type OrderDetail } from "@/lib/api";
import { nowMs } from "@shop/core/time";
import { hapticSuccess, haptic, isAndroidTelegram, onAppResume, openExternalLink } from "@/platform/telegram";

/** Re-renders every `ms` — for the "залишилось …" countdown. */
function useNow(ms: number): number {
  const [now, setNow] = useState(nowMs);
  useEffect(() => window.clearInterval.bind(window, window.setInterval(() => setNow(nowMs()), ms)), [ms]);
  return now;
}

/**
 * The payment flow of the order page: the refresh loop (webhook catch-up, return from the bank page),
 * the two ways of opening the monobank page, the deadline countdown. See OrderPayment for the story.
 */
export function usePaymentFlow({
  order,
  onOrder,
  onRefetch,
}: {
  order: OrderDetail;
  onOrder: (o: OrderDetail) => void;
  onRefetch: () => void;
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
  return { paying, payError, notOpened, watching, returning, pay, watch, state, topUp, status, dueAt, timeUp, now };
}
