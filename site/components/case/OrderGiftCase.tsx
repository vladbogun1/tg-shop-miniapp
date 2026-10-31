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
 * the prize list for «Що може бути в кейсі» is that tier's from the public gift (useGift, no chances);
 * after opening, the server's own list (`reel`) drives the reel. After the case the page shows
 * `panel`: the guaranteed discount the customer chose, the code of a discount prize, or the swap of a
 * product prize similar to what they bought (POST …/gift-case/swap).
 */
import { useCallback, useMemo } from "react";
import { CASE_RULES_PATH, CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import { useOrderGiftCase as useSharedOrderGiftCase, type CaseRefusal } from "@shop/customer/gift/use-order-gift-case";
import type { CaseT } from "@shop/customer/gift/texts";
import { shortOrderId } from "@shop/core/format";
import { type OrderDetail } from "@shop/core/types";
import { GiftCaseRarityChip, takeGiftCaseAutoOpen, type CasePromoTexts, type CaseRulesLinkProps, type CaseSizeTexts } from "@shop/ui/gift-case";
import { toast } from "@shop/ui/toast";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { trackGiftCaseOpen } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useGift } from "@/features/gift";
import { resolveImageSrc } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** The payment block of the order page (features/payment) — the locked card's CTA scrolls there. */
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

/** «Оберіть розмір» etc. — the size picker of a prize with sizes. */
export function useCaseSizeTexts(): CaseSizeTexts {
  const { t } = useI18n();
  return useMemo(
    () => ({
      choose: t("case.size.choose"),
      label: t("case.size.label"),
      chosen: t("case.size.chosen"),
      error: t("case.size.error"),
    }),
    [t]
  );
}

/** Money in minor units for the case pieces (the language on screen). */
export function useCaseMoney(): (minor: number) => string {
  const fmt = useFmt();
  return useCallback((minor: number) => fmt.money(minor), [fmt]);
}

/** «Правила акції» — the promotion rules page, in a new tab so the checkout / the case stays (docs/GIFT-CASE.md «Юридическое»). */
export function useCaseRules(): CaseRulesLinkProps {
  const { t, href } = useI18n();
  return useMemo(() => ({ label: t("case.rules"), href: href(CASE_RULES_PATH) }), [t, href]);
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
const resolveImage = caseImage;

/** Prizes of the tier (the public gift; `enabled` = ask only when they are needed). */
export function useCasePrizes(enabled: boolean, tier: CaseTier | null | undefined) {
  const gift = useGift(enabled);
  return { data: (gift?.kind === "CASE" && tier && gift.tiers.find((x) => x.tier === tier)?.prizes) || [] };
}

/** Platform of the website for the shared order-case hook: no haptics / back button, the wish to open comes from the URL. */
const noBackButton = () => {};
const usePrizes = (enabled: boolean, tier: CaseTier | null) => useCasePrizes(enabled, tier).data;
const wantsAutoOpen = (orderId: string) => {
  const sp = new URLSearchParams(window.location.search);
  return takeGiftCaseAutoOpen(orderId) || sp.get("created") === "1" || sp.get("payment") === "return";
};
const trackRevealed = (orderId: string, rarity: string) => trackGiftCaseOpen(orderId, rarity);

/** Everything the order page needs: `card` (top of the page while SEALED) and `overlay` (render once). */
export function useOrderGiftCase(order: OrderDetail) {
  const { t } = useI18n();
  const fmt = useFmt();
  const money = useCaseMoney();
  const rules = useCaseRules();
  const notifyRefused = useCallback(
    (code: CaseRefusal) => (code === "GIFT_CASE_UNPAID" ? toast.error : toast.success)(t(code === "GIFT_CASE_UNPAID" ? "case.lockedText" : "case.alreadyOpened")),
    [t]
  );
  return useSharedOrderGiftCase(order, {
    t,
    api: api.gift,
    shortId: shortOrderId,
    usePrizes,
    useBackButton: noBackButton,
    money,
    formatDate: fmt.date,
    resolveImage,
    rules,
    wantsAutoOpen,
    notifyRefused,
    trackRevealed,
    payAnchor: ORDER_PAY_ANCHOR,
  });
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
