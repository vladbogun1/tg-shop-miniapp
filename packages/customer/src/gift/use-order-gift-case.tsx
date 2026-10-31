"use client";

/**
 * Кейс-подарок на странице заказа (docs/GIFT-CASE.md): карточка кейса (сверху, пока он SEALED), экран открытия
 * (`GiftCaseOpening` из @shop/ui — один на оба приложения) и панель после кейса (гарантированная скидка, код приза,
 * замена на скидку, выбор размера).
 *
 * Правила владельца (их держит сервер): кейс открывается только после оплаты (`giftCaseOpenable`) и один раз — без
 * повторов; до оплаты карточка заперта и ведёт к блоку оплаты. Уровень (bronze/silver/gold) берётся из `order.gift.tier`.
 *
 * Mini App и сайт различаются только на границе платформы, и это `OrderGiftCasePorts`: тактильный отклик, кнопка
 * «Назад» Telegram, откуда взять «открыть сам», как показать отказ, аналитика, деньги/даты на языке экрана.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CaseItem, CaseTier, GiftCaseOpen } from "@shop/core/giftcase";
import { paymentState } from "@shop/core/orders";
import type { OrderDetail } from "@shop/core/types";
import {
  GiftCaseOpening,
  GiftCaseOrderPanel,
  GiftCaseSealedCard,
  hasGiftCaseOrderPanel,
  unlockCaseAudio,
  type CaseRulesLinkProps,
  type GiftCaseHaptics,
} from "@shop/ui/gift-case";
import type { GiftApi } from "./api";
import { caseTierNames, casePromoTexts, caseRarityNames, caseSizeTexts, giftCaseTexts, giftOrderPanelTexts, type CaseT } from "./texts";

export type CaseRefusal = "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED";

export interface OrderGiftCasePorts {
  t: CaseT;
  api: Pick<GiftApi, "openCase" | "swapCase" | "chooseSize">;
  /** Короткий номер заказа для заголовка экрана. */
  shortId: (orderId: string) => string;
  /** Призы уровня для «Що може бути в кейсі» (хук приложения; `enabled` — спрашивать, только когда нужно). */
  usePrizes: (enabled: boolean, tier: CaseTier | null) => CaseItem[];
  /** Хук кнопки «Назад»: вызвать `onBack`, пока экран открыт. На сайте — пустой. */
  useBackButton: (active: boolean, onBack: () => void) => void;
  money: (minor: number) => string;
  formatDate: (iso: string) => string;
  resolveImage: (src: string, size: number) => string;
  rules: CaseRulesLinkProps;
  /** Хотим ли открыть кейс сразу (из оформления / вернулись из банка). Вызывается при смене заказа. */
  wantsAutoOpen: (orderId: string) => boolean;
  /** Показать отказ сервера (не оплачен / уже открыт). */
  notifyRefused: (code: CaseRefusal) => void;
  /** Кейс показан — аналитика. */
  trackRevealed: (orderId: string, rarity: string) => void;
  /** Якорь блока оплаты страницы заказа. */
  payAnchor: string;
  /** Тактильный отклик; нет — тишина. `tick/stop/success` — экран открытия, `tap` — нажатия, `selection` — выбор размера. */
  feedback?: GiftCaseHaptics & { tap?: () => void; selection?: () => void };
}

/** `card` — карточка кейса (или панель после него), `overlay` — рендерить один раз. */
export function useOrderGiftCase(order: OrderDetail, p: OrderGiftCasePorts): { card: ReactNode; overlay: ReactNode; rarity: Record<string, string> } {
  const { t, feedback } = p;
  const qc = useQueryClient();
  const parts = useMemo(
    () => ({ rarity: caseRarityNames(t), tierName: caseTierNames(t), promo: casePromoTexts(t), size: caseSizeTexts(t) }),
    [t],
  );
  const tier = order.gift?.tier ?? null;
  const sealed = order.giftCaseStatus === "SEALED" && order.status !== "REJECTED";
  const openable = sealed && order.giftCaseOpenable === true;
  const [open, setOpen] = useState(false);
  const prizes = p.usePrizes(openable || open, tier);

  useAutoOpen(order.id, openable, p.wantsAutoOpen, setOpen);

  // The back button closes the screen — but not mid-spin.
  const closable = useRef(true);
  const close = useCallback(() => setOpen(false), []);
  p.useBackButton(open, () => {
    if (closable.current) close();
  });
  const onClosableChange = useCallback((c: boolean) => {
    closable.current = c;
  }, []);

  const { shortId } = p;
  const texts = useMemo(() => giftCaseTexts(t, shortId(order.id), parts), [t, shortId, order.id, parts]);
  const panelTexts = useMemo(() => giftOrderPanelTexts(t, parts), [t, parts]);

  const refreshOrders = useCallback(() => void qc.invalidateQueries({ queryKey: ["me", "orders"] }), [qc]);
  const { api } = p;
  const openCase = useCallback(() => api.openCase(order.id), [api, order.id]);
  const swapCase = useCallback(async () => {
    const res = await api.swapCase(order.id);
    feedback?.success?.();
    refreshOrders();
    return res;
  }, [api, order.id, feedback, refreshOrders]);
  const chooseSize = useCallback(
    async (variantId: string) => {
      feedback?.selection?.();
      const res = await api.chooseSize(order.id, variantId);
      feedback?.success?.();
      refreshOrders();
      return res;
    },
    [api, order.id, feedback, refreshOrders],
  );
  const { trackRevealed, notifyRefused } = p;
  const onRevealed = useCallback(
    (res: GiftCaseOpen) => {
      trackRevealed(order.id, res.won.rarity);
      refreshOrders();
    },
    [trackRevealed, order.id, refreshOrders],
  );
  const onOpenRefused = useCallback(
    (code: CaseRefusal) => {
      setOpen(false);
      notifyRefused(code);
      refreshOrders();
    },
    [notifyRefused, refreshOrders],
  );

  const start = () => {
    feedback?.tap?.();
    unlockCaseAudio();
    setOpen(true);
  };

  const tierLabel = tier ? parts.tierName[tier] : undefined;
  const card = sealed ? (
    <SealedCase order={order} p={p} tierLabel={tierLabel} openable={openable} onOpen={start} />
  ) : null;

  const overlay = (
    <GiftCaseOpening
      open={open}
      onClose={close}
      openCase={openCase}
      onOpenRefused={onOpenRefused}
      prizes={prizes}
      tier={tier}
      onSwap={swapCase}
      onSize={chooseSize}
      texts={texts}
      money={p.money}
      formatDate={p.formatDate}
      resolveImage={p.resolveImage}
      haptics={feedback}
      onRevealed={onRevealed}
      onClosableChange={onClosableChange}
      rules={p.rules}
    />
  );

  // After the case (or instead of it): the guaranteed discount, the prize code, the swap offer.
  const panel =
    !sealed && order.gift && order.status !== "REJECTED" && hasGiftCaseOrderPanel(order.gift) ? (
      <GiftCaseOrderPanel
        gift={order.gift}
        texts={panelTexts}
        money={p.money}
        formatDate={p.formatDate}
        onSwap={order.gift.swap?.available ? swapCase : undefined}
        onSize={chooseSize}
      />
    ) : null;

  return { card: card ?? panel, overlay, rarity: parts.rarity };
}

interface SealedCaseProps {
  order: OrderDetail;
  p: OrderGiftCasePorts;
  tierLabel: string | undefined;
  openable: boolean;
  onOpen: () => void;
}

/** Карточка запечатанного кейса: открыть (оплачено) или заперта (до оплаты — с переходом к блоку оплаты). */
function SealedCase({ order, p, tierLabel, openable, onOpen }: SealedCaseProps) {
  const { t, feedback } = p;
  const tier = order.gift?.tier ?? null;
  if (openable) {
    return (
      <GiftCaseSealedCard
        tier={tier}
        tierLabel={tierLabel}
        title={t("case.sealedTitle")}
        text={t("case.sealedText")}
        action={t("case.openShort")}
        onOpen={onOpen}
      />
    );
  }
  // Unpaid: the CTA leads to the payment block when there is something to pay online.
  const canPay = order.payment.enabled && paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const toPayment = () => {
    feedback?.tap?.();
    document.getElementById(p.payAnchor)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <GiftCaseSealedCard
      locked
      tier={tier}
      tierLabel={tierLabel}
      lockLabel={t("case.locked")}
      title={t("case.sealedTitle")}
      text={t("case.lockedText")}
      action={canPay ? t("case.payCta") : undefined}
      onOpen={canPay ? toPayment : undefined}
    />
  );
}

/** Straight from the checkout (or back from the bank) or paid while the page is open: show the case screen once by itself. */
function useAutoOpen(orderId: string, openable: boolean, wantsAutoOpen: (orderId: string) => boolean, setOpen: (open: boolean) => void) {
  // Straight from the checkout (or back from the bank): show the case screen once by itself — but only when it can
  // be opened. An unpaid order keeps the wish until it gets paid on this page.
  const autoWanted = useRef(false);
  useEffect(() => {
    autoWanted.current = autoWanted.current || wantsAutoOpen(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [orderId]);
  // Paid while the page is open (the payment form, the check after coming back): open it then.
  const wasOpenable = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasOpenable.current;
    wasOpenable.current = openable;
    if (!openable || !(autoWanted.current || before === false)) return;
    // past the payment modal's exit and the «Оплачено» scroll
    const id = window.setTimeout(
      () => {
        autoWanted.current = false;
        setOpen(true);
      },
      before === false ? 900 : 0,
    );
    return () => window.clearTimeout(id);
  }, [openable, orderId]);
}
