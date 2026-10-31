"use client";

/** Какие окна открыты над карточкой заказа и сброс «на новый заказ». */
import { useCallback, useEffect, useState } from "react";
import type { UserCardDto } from "@/features/customer";
import type { OrderStatus } from "@shop/core/types";

export type ModalName =
  "pay" | "gift" | "case" | "discount" | "tracking" | "delivery" | "return" | "exchange" | "merge" | "received" | "archive" | "more";

const CLOSED: Record<ModalName, boolean> = {
  pay: false,
  gift: false,
  case: false,
  discount: false,
  tracking: false,
  delivery: false,
  return: false,
  exchange: false,
  merge: false,
  received: false,
  archive: false,
  more: false,
};

/** Закрываются при открытии карточки другого заказа; подарок, кейс, скидка и слияние переживают смену. */
const RESET_ON_ORDER: ModalName[] = ["pay", "tracking", "delivery", "return", "exchange", "received", "archive", "more"];

export type TabName = "details" | "chat" | "history";

export function useDrawerModals(orderId: string | null, initialTab: "details" | "chat") {
  const [open, setOpen] = useState(CLOSED);
  const [tab, setTab] = useState<TabName>(initialTab);
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [profile, setProfile] = useState<UserCardDto | null>(null);

  const show = useCallback((name: ModalName) => setOpen((o) => ({ ...o, [name]: true })), []);
  const hide = useCallback((name: ModalName) => setOpen((o) => ({ ...o, [name]: false })), []);

  // Re-sync the active tab and drop per-order UI state when the drawer is (re)opened for a new order.
  useEffect(() => {
    if (!orderId) return;
    setTab(initialTab);
    setPendingTarget(null);
    setOpen((o) => {
      const next = { ...o };
      for (const name of RESET_ON_ORDER) next[name] = false;
      return next;
    });
  }, [orderId, initialTab]);

  return {
    open,
    show,
    hide,
    tab,
    setTab,
    pendingTarget,
    setPendingTarget,
    profile,
    setProfile,
  };
}

export type DrawerModals = ReturnType<typeof useDrawerModals>;
