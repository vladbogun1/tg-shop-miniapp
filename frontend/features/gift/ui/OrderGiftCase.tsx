"use client";

/**
 * The gift case in the Mini App's order page: the case card (top of the page while SEALED) and the
 * opening screen with Telegram haptics and the native back button. The logic is the shared
 * `useOrderGiftCase` of `@shop/customer/gift`; this file is the Mini App's platform (haptics, back button,
 * `startapp` hand-over from the checkout, toasts, analytics) and its names for the case texts.
 *
 * Owner's rules (the server enforces them): the case opens only once the order is paid
 * (`giftCaseOpenable`) and exactly once — no replays; after opening the order shows the prize line
 * with its rarity chip. Before payment the card is locked and points to the payment block.
 */
import type { LooseT } from "@shop/core/i18n";
import { useMemo } from "react";
import { caseRulesUrl, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import { type OrderDetail } from "@shop/core/types";
import { useOrderGiftCase as useSharedOrderGiftCase, type CaseRefusal, type OrderGiftCasePorts } from "@shop/customer/gift/use-order-gift-case";
import { casePromoTexts, caseRarityNames, caseSizeTexts, caseTierNames } from "@shop/customer/gift/texts";
import { GiftCaseRarityChip, takeGiftCaseAutoOpen, type CasePromoTexts, type CaseRulesLinkProps, type CaseSizeTexts } from "@shop/ui/gift-case";
import { toast } from "@shop/ui/toast";
import { useI18n, useT } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { customerApi } from "@/lib/api";
import { useGift } from "@/features/gift/use-gift";
import { formatDate, shortOrderId } from "@/lib/format";
import { money } from "@/lib/money";
import { resolveImageSrc } from "@/lib/image";
import { haptic, hapticImpact, hapticSelection, hapticSuccess, openExternalLink, useBackButton } from "@/platform/telegram";

/** The payment block of the order page — the locked card's CTA scrolls there. */
export const ORDER_PAY_ANCHOR = "order-pay";

export function useCaseRarityNames(): Record<CaseRarity, string> {
  const t = useT();
  return useMemo(() => caseRarityNames(t), [t]);
}

export function useCaseTierNames(): Record<CaseTier, string> {
  const t = useT();
  return useMemo(() => caseTierNames(t), [t]);
}

/** «Знижка −10% на наступне замовлення» etc. — the texts the case pieces share. */
export function useCasePromoTexts(): CasePromoTexts {
  const t = useT();
  return useMemo(() => casePromoTexts(t), [t]);
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

/** «Оберіть розмір» etc. — the size picker of a prize with sizes. */
export function useCaseSizeTexts(): CaseSizeTexts {
  const t = useT();
  return useMemo(() => caseSizeTexts(t), [t]);
}

export const caseImage = (src: string, size: number) => resolveImageSrc(src, size);
export const caseMoney = (minor: number) => money(minor);

const FEEDBACK: NonNullable<OrderGiftCasePorts["feedback"]> = {
  tick: hapticSelection,
  stop: () => hapticImpact("heavy"),
  success: hapticSuccess,
  tap: haptic,
  selection: hapticSelection,
};

/** Prizes of the tier (the public gift, lib/gift.ts; none while it is off / not loaded). */
function useCasePrizes(_enabled: boolean, tier: CaseTier | null) {
  const gift = useGift();
  if (gift?.kind !== "CASE") return [];
  return (tier && gift.tiers.find((x) => x.tier === tier)?.prizes) || [];
}

const refusedNotifier = (t: LooseT) => (code: CaseRefusal) =>
  toast.success(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened"), { duration: 3200 });

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail, created: boolean) {
  const t = useT();
  const rules = useCaseRules();
  const notify = useMemo(() => refusedNotifier(t), [t]);
  const ports: OrderGiftCasePorts = {
    t,
    api: customerApi.gift,
    shortId: shortOrderId,
    usePrizes: useCasePrizes,
    useBackButton,
    money: caseMoney,
    formatDate,
    resolveImage: caseImage,
    rules,
    // Straight from the checkout: show the case screen once by itself.
    wantsAutoOpen: (orderId) => takeGiftCaseAutoOpen(orderId) || created,
    notifyRefused: notify,
    trackRevealed: trackGiftCaseOpen,
    payAnchor: ORDER_PAY_ANCHOR,
    feedback: FEEDBACK,
  };
  const { card, overlay } = useSharedOrderGiftCase(order, ports);
  return { card, overlay };
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
