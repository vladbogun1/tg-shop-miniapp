import type { CaseRarity, CaseTier } from "@shop/core/giftcase";

/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const giftKeys = {
  /** Корень: всё, что держит экран «Кейс» (сохранение настроек подарка сбрасывает его целиком). */
  all: () => ["gift"] as const,
  stats: () => ["gift", "stats"] as const,
  tiers: () => ["gift", "tiers"] as const,
  caseItems: () => ["gift", "case-items"] as const,
  registry: (from: string, to: string) => ["gift", "registry", from, to] as const,
  lowMargin: () => ["gift", "low-margin"] as const,
  alternatives: (tier: CaseTier, rarity: CaseRarity | undefined, used: string[]) =>
    ["gift", "alternatives", tier, rarity, used.join(",")] as const,
  /** Своя копия настроек: на ключе страницы висит форма, её черновик не должен сбрасываться. */
  autofillSettings: () => ["gift", "autofill-settings"] as const,
};
