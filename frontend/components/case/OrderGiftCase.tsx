"use client";

/**
 * The gift case in the Mini App's order page: the case card (top of the page while SEALED) and the
 * opening screen (@shop/shared/case-ui, the same as the website) with Telegram haptics and the
 * native back button.
 *
 * Owner's rules (the server enforces them): the case opens only once the order is paid
 * (`giftCaseOpenable`) and exactly once — no replays; after opening the order shows the prize line
 * with its rarity chip. Before payment the card is locked and points to the payment block.
 *
 * Three tiers (bronze/silver/gold): the order's tier (`order.gift.tier`) skins the card and the screen;
 * the prize list for «Що може бути в кейсі» is that tier's from the public gift (GET /api/public/gift, no
 * chances); after opening, the server's own list (`reel`) drives the reel. After the case the order
 * page shows `panel`: the guaranteed discount the customer chose, the code of a discount prize, or the
 * swap of a product prize similar to what they bought (POST …/gift-case/swap).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CASE_TIER_ORDER, caseRulesUrl, paymentState, type CaseRarity, type CaseTier, type GiftCaseOpen, type OrderDetail } from "@shop/shared";
import {
  GiftCaseOpening,
  GiftCaseOrderPanel,
  hasGiftCaseOrderPanel,
  GiftCaseRarityChip,
  GiftCaseSealedCard,
  takeGiftCaseAutoOpen,
  unlockCaseAudio,
  type GiftCaseHaptics,
  type CasePromoTexts,
  type CaseRulesLinkProps,
  type GiftCaseTexts,
  type GiftOrderPanelTexts,
} from "@shop/shared/case-ui";
import { Toast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { customerApi } from "@/lib/api";
import { useGift } from "@/lib/gift";
import { formatDate, shortOrderId } from "@/lib/format";
import { money } from "@/lib/money";
import { resolveImageSrc } from "@/lib/image";
import { haptic, hapticImpact, hapticSelection, hapticSuccess, openExternalLink, useBackButton } from "@/lib/telegram";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** The payment block of the order page — the locked card's CTA scrolls there. */
export const ORDER_PAY_ANCHOR = "order-pay";

export function useCaseRarityNames(): Record<CaseRarity, string> {
  const t = useT();
  return useMemo(() => Object.fromEntries(RARITIES.map((r) => [r, t(`case.rarity.${r}`)])) as Record<CaseRarity, string>, [t]);
}

export function useCaseTierNames(): Record<CaseTier, string> {
  const t = useT();
  return useMemo(() => Object.fromEntries(CASE_TIER_ORDER.map((r) => [r, t(`case.tier.${r}`)])) as Record<CaseTier, string>, [t]);
}

/** «Знижка −10% на наступне замовлення» etc. — the texts the case pieces share. */
export function useCasePromoTexts(): CasePromoTexts {
  const t = useT();
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

/** «Правила акції» — the rules page on the website, opened over the Mini App (docs/GIFT-CASE.md «Юридическое»). */
export function useCaseRules(): CaseRulesLinkProps {
  const { t, locale } = useI18n();
  return useMemo(() => ({ label: t("case.rules"), href: caseRulesUrl(locale), onOpen: openExternalLink }), [t, locale]);
}

/** The same link, quiet, in the app's own colours — next to «Що може бути в кейсі» on the product and in the cart. */
export function CaseRulesInline() {
  const { label, href, onOpen } = useCaseRules();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        if (onOpen) {
          e.preventDefault();
          onOpen(href);
        }
      }}
      className="inline-flex min-h-8 items-center text-[11px] font-medium text-[var(--muted)] underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
    >
      {label}
    </a>
  );
}

export const caseImage = (src: string, size: number) => resolveImageSrc(src, size);
export const caseMoney = (minor: number) => money(minor);

const HAPTICS: GiftCaseHaptics = {
  tick: hapticSelection,
  stop: () => hapticImpact("heavy"),
  success: hapticSuccess,
};

/** Prizes of the tier (the public gift, lib/gift.ts; none while it is off / not loaded). */
function useCasePrizes(tier: CaseTier | null | undefined) {
  const gift = useGift();
  if (gift?.kind !== "CASE") return [];
  return (tier && gift.tiers.find((x) => x.tier === tier)?.prizes) || [];
}

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail, created: boolean) {
  const t = useT();
  const qc = useQueryClient();
  const rarity = useCaseRarityNames();
  const tierName = useCaseTierNames();
  const promoTexts = useCasePromoTexts();
  const tier = order.gift?.tier ?? null;
  const sealed = order.giftCaseStatus === "SEALED" && order.status !== "REJECTED";
  const openable = sealed && order.giftCaseOpenable === true;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prizes = useCasePrizes(tier);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Straight from the checkout: show the case screen once by itself — but only when it can be
  // opened. An unpaid order keeps the wish until it gets paid on this page.
  const autoWanted = useRef(false);
  useEffect(() => {
    autoWanted.current = autoWanted.current || takeGiftCaseAutoOpen(order.id) || created;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [order.id]);
  // Paid while the page is open (the payment form, the check after coming back): open it then.
  const wasOpenable = useRef<boolean | null>(null);
  useEffect(() => {
    const before = wasOpenable.current;
    wasOpenable.current = openable;
    if (!openable || !(autoWanted.current || before === false)) return;
    const id = window.setTimeout(() => {
      autoWanted.current = false;
      setOpen(true);
    }, before === false ? 900 : 0);
    return () => window.clearTimeout(id);
  }, [openable, order.id]);

  // Telegram's back button (and Android's hardware back) closes the screen — but not mid-spin.
  const closable = useRef(true);
  const close = useCallback(() => setOpen(false), []);
  useBackButton(open, () => {
    if (closable.current) close();
  });
  const onClosableChange = useCallback((c: boolean) => {
    closable.current = c;
  }, []);

  const rules = useCaseRules();
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

  const openCase = useCallback(() => customerApi.openGiftCase(order.id), [order.id]);
  const swapCase = useCallback(async () => {
    const res = await customerApi.swapGiftCase(order.id);
    hapticSuccess();
    void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    return res;
  }, [order.id, qc]);
  const onRevealed = useCallback(
    (res: GiftCaseOpen) => {
      trackGiftCaseOpen(order.id, res.won.rarity);
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [order.id, qc]
  );
  const onOpenRefused = useCallback(
    (code: "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED") => {
      setOpen(false);
      setToast(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened"));
      void qc.invalidateQueries({ queryKey: ["me", "orders"] });
    },
    [qc, t]
  );

  const start = () => {
    haptic();
    unlockCaseAudio();
    setOpen(true);
  };

  // Unpaid: the CTA leads to the payment block when there is something to pay online.
  const canPay = order.payment.enabled && paymentState(order) === "AWAITING" && order.amountDueMinor > 0;
  const toPayment = () => {
    haptic();
    document.getElementById(ORDER_PAY_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
    <>
      <GiftCaseOpening
        open={open}
        onClose={close}
        openCase={openCase}
        onOpenRefused={onOpenRefused}
        prizes={prizes}
        tier={tier}
        onSwap={swapCase}
        texts={texts}
        money={caseMoney}
        formatDate={formatDate}
        resolveImage={caseImage}
        haptics={HAPTICS}
        onRevealed={onRevealed}
        onClosableChange={onClosableChange}
        rules={rules}
      />
      <Toast message={toast} />
    </>
  );

  // After the case (or instead of it): the guaranteed discount, the prize code, the swap offer.
  const panel =
    !sealed && order.gift && order.status !== "REJECTED" && hasGiftCaseOrderPanel(order.gift) ? (
      <GiftCaseOrderPanel
        gift={order.gift}
        texts={panelTexts}
        money={caseMoney}
        formatDate={formatDate}
        onSwap={order.gift.swap?.available ? swapCase : undefined}
      />
    ) : null;

  return { card: card ?? panel, overlay };
}

/** «Епічний · з кейса» under the prize line of an opened case (no replay — a case opens once). */
export function CasePrizeNote({ rarity }: { rarity: CaseRarity }) {
  const t = useT();
  const names = useCaseRarityNames();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <GiftCaseRarityChip rarity={rarity} label={t("case.fromCase", { rarity: names[rarity] })} />
    </span>
  );
}
