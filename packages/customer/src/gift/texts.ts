/**
 * Надписи кейса из словаря приложения: названия редкостей и уровней, тексты промокода и выбора размера, тексты экрана
 * открытия и панели заказа. Ключи `case.*` в обоих приложениях одни и те же; `t` — функция словаря приложения.
 */
import type { LooseT } from "@shop/core/i18n";
import { CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { CasePromoTexts, CaseSizeTexts, GiftCaseTexts, GiftOrderPanelTexts } from "@shop/ui/gift-case";

export type CaseT = LooseT;

const RARITIES: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

export function caseRarityNames(t: CaseT): Record<CaseRarity, string> {
  return Object.fromEntries(RARITIES.map((r) => [r, t(`case.rarity.${r}`)])) as Record<CaseRarity, string>;
}

/** `kind`: полное название («Бронзовий кейс»), короткое для лестницы и винительный падеж для «отримаєте …». */
export function caseTierNames(t: CaseT, kind: "tier" | "tierShort" | "tierAcc" = "tier"): Record<CaseTier, string> {
  return Object.fromEntries(CASE_TIER_ORDER.map((r) => [r, t(`case.${kind}.${r}`)])) as Record<CaseTier, string>;
}

/** «Знижка −10% на наступне замовлення» и т. п. — тексты промокода приза. */
export function casePromoTexts(t: CaseT): CasePromoTexts {
  return {
    label: t("case.promo.label"),
    copy: t("case.promo.copy"),
    copied: t("case.promo.copied"),
    validUntil: t("case.promo.validUntil"),
    used: t("case.promo.used"),
  };
}

/** «Оберіть розмір» и т. п. — выбор размера приза с размерами. */
export function caseSizeTexts(t: CaseT): CaseSizeTexts {
  return {
    choose: t("case.size.choose"),
    label: t("case.size.label"),
    chosen: t("case.size.chosen"),
    error: t("case.size.error"),
  };
}

export interface CaseTextParts {
  rarity: Record<CaseRarity, string>;
  tierName: Record<CaseTier, string>;
  promo: CasePromoTexts;
  size: CaseSizeTexts;
}

/** Экран открытия кейса; `shortId` — короткий номер заказа для заголовка. */
export function giftCaseTexts(t: CaseT, shortId: string, p: CaseTextParts): GiftCaseTexts {
  return {
    title: t("case.title", { id: shortId }),
    eyebrow: t("case.eyebrow"),
    canDrop: t("case.canDrop"),
    open: t("case.open"),
    opening: t("case.opening"),
    rarity: p.rarity,
    youGot: t("case.youGot"),
    addedFree: t("case.addedFree"),
    take: t("case.take"),
    close: t("case.close"),
    soundOn: t("case.soundOn"),
    soundOff: t("case.soundOff"),
    error: t("case.error"),
    retry: t("case.retry"),
    tierName: p.tierName,
    discountTitle: t("case.discountTitle"),
    discountNext: t("case.discountNext"),
    promo: p.promo,
    swapHint: t("case.swapHint"),
    swapAction: t("case.swapAction"),
    swapped: t("case.swapped"),
    swapError: t("case.swapError"),
    size: p.size,
  };
}

/** Панель после кейса на странице заказа: гарантированная скидка, код приза, замена на скидку. */
export function giftOrderPanelTexts(t: CaseT, p: CaseTextParts): GiftOrderPanelTexts {
  return {
    tierName: p.tierName,
    rarity: p.rarity,
    prizeTitle: t("case.order.prizeTitle"),
    discountPrize: t("case.order.discountPrize"),
    promo: p.promo,
    swapTitle: t("case.order.swapTitle"),
    swapHint: t("case.swapHint"),
    swapAction: t("case.swapAction"),
    swapped: t("case.swapped"),
    swapError: t("case.swapError"),
    guaranteedTitle: t("case.order.discountTitle"),
    guaranteedText: t("case.order.discountText"),
    size: p.size,
  };
}
