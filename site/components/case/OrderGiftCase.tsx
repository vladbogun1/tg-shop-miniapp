"use client";

/**
 * The gift case on the website's order page: the case card (top of the page while SEALED) and the
 * opening screen (@shop/shared/case-ui, the same as the Mini App).
 *
 * Owner's rules (the server enforces them): the case opens only once the order is paid
 * (`giftCaseOpenable`) and exactly once — no replays; after opening the order shows the prize line
 * with its rarity chip. Before payment the card is locked and points to the payment block.
 *
 * Three tiers (bronze/silver/gold): the order's tier (`order.gift.tier`) skins the card and the screen;
 * the prize list for «Що може випасти» is that tier's from the public gift (useGift, no chances);
 * after opening, the server's own list (`reel`) drives the reel. After the case the page shows
 * `panel`: the guaranteed discount the customer chose, the code of a discount prize, or the swap of a
 * product prize similar to what they bought (POST …/gift-case/swap).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CASE_TIER_ORDER, paymentState, shortOrderId, type CaseRarity, type CaseTier, type OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseOrderPanel,
  hasGiftCaseOrderPanel,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type CasePromoTexts,
  type GiftCaseTexts,
  type GiftOrderPanelTexts,
} from "@shop/shared/case-ui";
import { toast } from "@/components/ui/Toast";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useGift } from "@/lib/gift";
import { resolveImageSrc } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** The payment block of the order page (components/order/Payment.tsx) — the locked card's CTA scrolls there. */
export const ORDER_PAY_ANCHOR = "order-pay";

export function useCaseRarityNames(): Record<CaseRarity, string> {
  const { t } = useI18n();
  return useMemo(
    () => Object.fromEntries(RARITIES.map((r) => [r, t(`case.rarity.${r}` as MessageKey)])) as Record<CaseRarity, string>,
    [t]
  );
}

export function useCaseTierNames(kind: "tier" | "tierShort" | "tierAcc" = "tier"): Record<CaseTier, string> {
  const { t } = useI18n();
  return useMemo(
    () => Object.fromEntries(CASE_TIER_ORDER.map((r) => [r, t(`case.${kind}.${r}` as MessageKey)])) as Record<CaseTier, string>,
    [t, kind]
  );
}

export function useCasePromoTexts(): CasePromoTexts {
  const { t } = useI18n();
  return useMemo(
    () => ({
      label: t("case.promo.label"),
      copy: t("case.promo.copy"),
      copied: t("case.promo.copied"),
      validUntil: t("case.promo.validUntil"),
      used: t("case.promo.used"),
    }),
    [t]
  );
}

/** Money in minor units for the case pieces (the language on screen). */
export function useCaseMoney(): (minor: number) => string {
  const fmt = useFmt();
  return useCallback((minor: number) => fmt.money(minor), [fmt]);
}

export const caseImage = (src: string, size: number) => resolveImageSrc(src, size);
const resolveImage = caseImage;

/** Prizes of the tier (the public gift; `enabled` = ask only when they are needed). */
export function useCasePrizes(enabled: boolean, tier: CaseTier | null | undefined) {
  const gift = useGift(enabled);
  return { data: (gift?.kind === "CASE" && tier && gift.tiers.find((x) => x.tier === tier)?.prizes) || [] };
}

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail) {
  const { t } = useI18n();
  const fmt = useFmt();
  const money = useCaseMoney();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const tierName = useCaseTierNames();
  const promoTexts = useCasePromoTexts();
  const tier = order.gift?.tier ?? null;
  const sealed = order.giftCaseStatus === "SEALED" && order.status !== "REJECTED";
  const openable = sealed && order.giftCaseOpenable === true;
  const [open, setOpen] = useState(false);
  const prizes = useCasePrizes(openable || open, tier);

  // Straight from the checkout or back from the bank: show the case screen once by itself — but only
  // when it can actually be opened. An unpaid order keeps the wish until it gets paid on this page.
  const autoWanted = useRef(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    autoWanted.current =
      autoWanted.current || takeGiftCaseAutoOpen(order.id) || sp.get("created") === "1" || sp.get("payment") === "return";
  }, [order.id]);
  // Paid while the page is open (the payment form, the check after coming back): open it then.
  const wasOpenable = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasOpenable.current;
    wasOpenable.current = openable;
    if (!openable || !(autoWanted.current || before === false)) return;
    // past the payment modal's exit and the «Оплачено» scroll
    const id = window.setTimeout(() => {
      autoWanted.current = false;
      setOpen(true);
    }, before === false ? 900 : 0);
    return () => window.clearTimeout(id);
  }, [openable, order.id]);

  const texts: GiftCaseTexts = useMemo(
    () => ({
      title: t("case.title", { id: shortOrderId(order.id) }),
      eyebrow: t("case.eyebrow"),
      canDrop: t("case.canDrop"),
      open: t("case.open"),
      opening: t("case.opening"),
      rarity,
      youGot: t("case.youGot"),
      addedFree: t("case.addedFree"),
      take: t("case.take"),
      close: t("case.close"),
      soundOn: t("case.soundOn"),
      soundOff: t("case.soundOff"),
      error: t("case.error"),
      retry: t("case.retry"),
      tierName,
      discountTitle: t("case.discountTitle"),
      discountNext: t("case.discountNext"),
      promo: promoTexts,
      swapHint: t("case.swapHint"),
      swapAction: t("case.swapAction"),
      swapped: t("case.swapped"),
      swapError: t("case.swapError"),
    }),
    [t, order.id, rarity, tierName, promoTexts]
  );
  const panelTexts: GiftOrderPanelTexts = useMemo(
    () => ({
      tierName,
      rarity,
      prizeTitle: t("case.order.prizeTitle"),
      discountPrize: t("case.order.discountPrize"),
      promo: promoTexts,
      swapTitle: t("case.order.swapTitle"),
      swapHint: t("case.swapHint"),
      swapAction: t("case.swapAction"),
      swapped: t("case.swapped"),
      swapError: t("case.swapError"),
      guaranteedTitle: t("case.order.discountTitle"),
      guaranteedText: t("case.order.discountText"),
    }),
    [t, tierName, rarity, promoTexts]
  );

  const openCase = useCallback(() => api.openGiftCase(order.id), [order.id]);
  const swapCase = useCallback(async () => {
    const res = await api.swapGiftCase(order.id);
    void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    return res;
  }, [order.id, qc]);
  const onRevealed = useCallback(
    (res: { won: { rarity: string } }) => {
      trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc]
  );
  const onOpenRefused = useCallback(
    (code: "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED") => {
      setOpen(false);
      toast(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened"), code === "GIFT_CASE_UNPAID" ? "error" : "ok");
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [qc, t]
  );
  const close = useCallback(() => setOpen(false), []);

  const start = () => {
    unlockCaseAudio();
    setOpen(true);
  };

  // Unpaid: the CTA leads to the payment block when there is something to pay online.
  const canPay = order.payment.enabled && paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const toPayment = () => document.getElementById(ORDER_PAY_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const card = !sealed ? null : openable ? (
    <GiftCaseSealedCard
      tier={tier}
      tierLabel={tier ? tierName[tier] : undefined}
      title={t("case.sealedTitle")}
      text={t("case.sealedText")}
      action={t("case.openShort")}
      onOpen={start}
    />
  ) : (
    <GiftCaseSealedCard
      locked
      tier={tier}
      tierLabel={tier ? tierName[tier] : undefined}
      lockLabel={t("case.locked")}
      title={t("case.sealedTitle")}
      text={t("case.lockedText")}
      action={canPay ? t("case.payCta") : undefined}
      onOpen={canPay ? toPayment : undefined}
    />
  );

  const overlay = (
    <GiftCaseOpening
      open={open}
      onClose={close}
      openCase={openCase}
      onOpenRefused={onOpenRefused}
      prizes={prizes.data ?? []}
      tier={tier}
      onSwap={swapCase}
      texts={texts}
      money={money}
      formatDate={fmt.date}
      resolveImage={resolveImage}
      onRevealed={onRevealed}
    />
  );

  // After the case (or instead of it): the guaranteed discount, the prize code, the swap offer.
  const panel =
    !sealed && order.gift && order.status !== "REJECTED" && hasGiftCaseOrderPanel(order.gift) ? (
      <GiftCaseOrderPanel
        gift={order.gift}
        texts={panelTexts}
        money={money}
        formatDate={fmt.date}
        onSwap={order.gift.swap?.available ? swapCase : undefined}
      />
    ) : null;

  return { card: card ?? panel, overlay, rarity };
}

/** «Епічний · з кейса» under the prize line of an opened case (no replay — a case opens once). */
export function CasePrizeNote({ rarity }: { rarity: CaseRarity }) {
  const { t } = useI18n();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
    </span>
  );
}
