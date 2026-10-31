import type { CaseRarity, CaseTier } from "@shop/core/giftcase";
import type { GiftSource } from "./types";

/** Настройки группы `gift` (общий экран настроек её скрывает). */
export const GIFT_GROUP = "gift";

export const GIFT_SOURCE_LABEL: Record<GiftSource, string> = {
  CASE: "Кейс",
  THRESHOLD: "Подарок за сумму",
  ADMIN: "От админа",
};

/** Russian names of the case rarities (admin is Russian-only). */
export const CASE_RARITY_LABEL: Record<CaseRarity, string> = {
  COMMON: "Обычный",
  RARE: "Редкий",
  EPIC: "Эпический",
  LEGENDARY: "Легендарный",
  GOLD: "Золотой",
};

export const CASE_TIER_LABEL: Record<CaseTier, string> = {
  BRONZE: "Бронзовый",
  SILVER: "Серебряный",
  GOLD: "Золотой",
};

/** Defaults of «Автособрать» by tier: share of the margin a case may cost, %. */
export const AUTOFILL_COST_SHARE: Record<CaseTier, number> = { BRONZE: 60, SILVER: 50, GOLD: 60 };
