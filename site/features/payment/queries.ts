"use client";

/**
 * Hooks of the order's payment block. When the monobank modal closes after a payment, or the customer
 * comes back from the new-tab fallback page with `?payment=return`, the webhook may lag, so the page
 * asks POST .../payment/refresh every 3 s for up to a minute (`usePaymentCheck`).
 */
import { orderKeys } from "@shop/customer/order/keys";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { needsTopUp } from "@shop/core/orders";
import { IN_FLIGHT, POLL_EVERY_MS, POLL_FOR_MS } from "@shop/customer/payment/model";
import { type OrderDetail } from "@shop/core/types";
import { nowMs } from "@shop/core/time";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { FINAL_PAYMENT_STATUSES, GIVE_UP_UNPAID_MS } from "./model/helpers";

/**
 * Back from a page the browser left (the checkout, the order page) via its Back button: the page
 * comes out of the bfcache exactly as it was left. `onRestore` puts it right.
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

/** Current time, ticking every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(nowMs()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** Paid while this page was open: scroll to the top, where «Оплачено» now sits (past the modal's exit). */
export function useScrollTopWhenPaid(paid: boolean): void {
  const wasPaid = useRef(paid);
  useEffect(() => {
    if (paid && !wasPaid.current) {
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 350);
    }
    wasPaid.current = paid;
  }, [paid]);
}

/**
 * Checking the payment status after the customer came back from the bank (or it said a payment is in
 * progress). `modalOpen`: while the form is open the modal polls on its own. `apply` puts a fresh
 * order into the query cache.
 */
export function usePaymentCheck(order: OrderDetail, modalOpen: boolean) {
  const { href, locale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  /** `?payment=return` is still in the address bar. */
  const [returnParam, setReturnParam] = useState(false);
  /** Came back from monobank (or it said a payment is in progress): check the status. */
  const [returning, setReturning] = useState(false);
  /** Polling ran out while the bank was still processing. */
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get("payment") === "return";
    setReturnParam(back);
    setReturning(back);
  }, [order.id]);

  const inFlight = IN_FLIGHT.includes(order.payment.status);
  const shouldCheck =
    (!order.paid || needsTopUp(order)) && order.status !== "REJECTED" && (returning || inFlight) && !stalled && !modalOpen;

  // The latest order setter, without restarting the polling loop on every render.
  const apply = useRef<(d: OrderDetail) => void>(() => {});
  useEffect(() => {
    apply.current = (d) => {
      qc.setQueryData(orderKeys.detail(order.id, locale), d);
      void qc.invalidateQueries({ queryKey: orderKeys.list(), exact: true });
    };
  });

  useEffect(() => {
    if (!shouldCheck) return;
    let cancelled = false;
    let timer = 0;
    const started = nowMs();
    const tick = async () => {
      let d: OrderDetail | null = null;
      try {
        d = await api.refreshPayment(order.id);
      } catch {
        /* throttled or offline — the next tick tries again */
      }
      if (cancelled) return;
      if (d) apply.current(d);
      const elapsed = nowMs() - started;
      const settled = !!d && isSettled(d, elapsed);
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

  return { inFlight, shouldCheck, stalled, setStalled, setReturning, apply };
}

function isSettled(d: OrderDetail, elapsed: number): boolean {
  const s = d.payment.status;
  if ((d.paid && !needsTopUp(d)) || d.status === "REJECTED") return true;
  if (s !== undefined && FINAL_PAYMENT_STATUSES.has(s)) return true;
  return (s === "created" || s === "none") && elapsed >= GIVE_UP_UNPAID_MS;
}
