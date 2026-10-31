"use client";

/**
 * initialAction: запоминаем, для какого заказа его просили, и выполняем, когда заказ загрузился —
 * «payment» прокручивает к «Онлайн-оплате», «return» открывает мастер возврата, «received» — «Посылка вернулась».
 */
import { useEffect, useRef, useState } from "react";
import type { AdminOrderDetail } from "../../api";
import { receivedAllowed } from "../../model/drawer-rules";
import type { ModalName, TabName } from "./use-drawer-modals";

export type InitialAction = "payment" | "return" | "received";

const SCROLL_DELAY_MS = 120;

export function useInitialAction(args: {
  orderId: string | null;
  order: AdminOrderDetail | undefined;
  initialAction: InitialAction | undefined;
  tab: TabName;
  show: (name: ModalName) => void;
}) {
  const { orderId, order, initialAction, tab, show } = args;
  const paymentRef = useRef<HTMLElement>(null);
  const [autoPaymentFor, setAutoPaymentFor] = useState<string | null>(null);
  useEffect(() => {
    setAutoPaymentFor(orderId && initialAction === "payment" ? orderId : null);
  }, [orderId, initialAction]);
  const [autoModalFor, setAutoModalFor] = useState<string | null>(null);
  useEffect(() => {
    setAutoModalFor(orderId && (initialAction === "return" || initialAction === "received") ? orderId : null);
  }, [orderId, initialAction]);
  useEffect(() => {
    if (autoModalFor && order && autoModalFor === orderId) {
      if (initialAction === "return") show("return");
      else if (initialAction === "received" && receivedAllowed(order)) show("received");
      setAutoModalFor(null);
    }
  }, [autoModalFor, order, orderId, initialAction, show]);
  useEffect(() => {
    if (autoPaymentFor && order && autoPaymentFor === orderId && tab === "details") {
      // After the details have rendered (the section mounts with the order).
      const t = window.setTimeout(
        () =>
          paymentRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        SCROLL_DELAY_MS,
      );
      setAutoPaymentFor(null);
      return () => window.clearTimeout(t);
    }
  }, [autoPaymentFor, order, orderId, tab]);
  return paymentRef;
}
