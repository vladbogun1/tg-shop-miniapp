import { describe, expect, it } from "vitest";
import { buildCaseReel, caseDiscountText, caseRulesUrl, caseTierRank, giftCaseOpenErrorCode, giftProgress, guaranteedDiscountMinor, rarestCasePrize, sortCasePrizes, CASE_REEL_LENGTH, CASE_REEL_WIN_INDEX, type CaseItem, type GiftInfo, type GiftTierInfo } from "./giftcase";

const tier = (over: Partial<GiftTierInfo>): GiftTierInfo => ({ tier: "BRONZE", thresholdMinor: 100_000, guaranteedPercent: 0, guaranteedMaxMinor: 0, ...over }) as GiftTierInfo;
const prize = (key: string, rarity: CaseItem["rarity"], over: Partial<CaseItem> = {}): CaseItem => ({ key, rarity, kind: "PRODUCT", title: key, priceMinor: 100, ...over }) as CaseItem;

describe("giftProgress", () => {
  const info = { kind: "CASE", thresholdMinor: 0, tiers: [tier({ tier: "SILVER", thresholdMinor: 200_000 }), tier({ tier: "BRONZE", thresholdMinor: 100_000 })] } as unknown as GiftInfo;

  it("no gift, no progress", () => {
    expect(giftProgress(null, 1)).toBeNull();
  });

  it("CASE: below the first tier, in the middle, and past the last", () => {
    const low = giftProgress(info, 50_000)!;
    expect([low.reached, low.tier, low.next?.tier, low.remainingMinor]).toEqual([false, null, "BRONZE", 50_000]);
    expect(low.share).toBeCloseTo(0.5);
    const mid = giftProgress(info, 150_000)!;
    expect([mid.reached, mid.tier?.tier, mid.next?.tier, mid.remainingMinor]).toEqual([true, "BRONZE", "SILVER", 50_000]);
    const top = giftProgress(info, 500_000)!;
    expect([top.tier?.tier, top.next, top.remainingMinor, top.share]).toEqual(["SILVER", null, 0, 1]);
  });

  it("PRODUCT gift: reached at the threshold, an empty cart reaches nothing", () => {
    const p = { kind: "PRODUCT", thresholdMinor: 100_000 } as unknown as GiftInfo;
    expect(giftProgress(p, 100_000)!.reached).toBe(true);
    expect(giftProgress(p, 99_999)!.remainingMinor).toBe(1);
    expect(giftProgress({ ...p, thresholdMinor: 0 } as GiftInfo, 0)!.reached).toBe(false);
  });
});

describe("guaranteedDiscountMinor", () => {
  it("whole hryvnias of the percent, capped by the tier max and by the total", () => {
    expect(guaranteedDiscountMinor(tier({ guaranteedPercent: 5 }), 100_050)).toBe(5_000);
    expect(guaranteedDiscountMinor(tier({ guaranteedPercent: 5, guaranteedMaxMinor: 3_000 }), 100_000)).toBe(3_000);
    expect(guaranteedDiscountMinor(tier({ guaranteedPercent: 0 }), 100_000)).toBe(0);
    expect(guaranteedDiscountMinor(null, 100_000)).toBe(0);
    expect(guaranteedDiscountMinor(tier({ guaranteedPercent: 500 }), 100_000)).toBe(100_000);
  });
});

describe("prizes", () => {
  it("rank helpers treat unknown values as the lowest", () => {
    expect(caseTierRank("GOLD")).toBeGreaterThan(caseTierRank("SILVER"));
    expect(caseTierRank("???")).toBe(0);
  });

  it("sortCasePrizes: rarest first, then dearest; rarestCasePrize prefers products", () => {
    const items = [prize("c", "COMMON", { priceMinor: 900 }), prize("g", "GOLD"), prize("c2", "COMMON", { priceMinor: 100 })];
    expect(sortCasePrizes(items).map((i) => i.key)).toEqual(["g", "c", "c2"]);
    expect(rarestCasePrize(items)?.key).toBe("g");
    expect(rarestCasePrize([])).toBeNull();
    const discount = prize("d", "GOLD", { kind: "DISCOUNT", title: "" });
    expect(rarestCasePrize([discount, prize("p", "COMMON")])?.key).toBe("p");
  });

  it("caseDiscountText: percent or money", () => {
    const m = (n: number) => `${n / 100} UAH`;
    expect(caseDiscountText({ discountPercent: 10 }, m)).toBe("−10%");
    expect(caseDiscountText({ amountMinor: 30_000 }, m)).toBe("−300 UAH");
  });
});

describe("buildCaseReel", () => {
  it("puts the real prize at the stop index and draws only from the pool", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pool = [prize("a", "COMMON"), prize("b", "RARE"), prize("z", "GOLD")];
    const reel = buildCaseReel(pool, pool[0], { random });
    expect(reel).toHaveLength(CASE_REEL_LENGTH);
    expect(reel[CASE_REEL_WIN_INDEX].key).toBe("a");
    expect(reel.every((r) => pool.some((p) => p.key === r.key))).toBe(true);
  });

  it("works with an empty pool (only the won prize)", () => {
    const won = prize("w", "EPIC");
    expect(buildCaseReel([], won, { length: 5, winIndex: 2, random: () => 0.5 }).every((r) => r.key === "w")).toBe(true);
  });
});

describe("misc", () => {
  it("caseRulesUrl: Ukrainian without a prefix, others with", () => {
    expect(caseRulesUrl("uk", "https://x.test/")).toBe("https://x.test/case-rules");
    expect(caseRulesUrl("en", "https://x.test")).toBe("https://x.test/en/case-rules");
  });

  it("giftCaseOpenErrorCode reads only the two known codes", () => {
    expect(giftCaseOpenErrorCode({ code: "GIFT_CASE_UNPAID" })).toBe("GIFT_CASE_UNPAID");
    expect(giftCaseOpenErrorCode({ code: "OTHER" })).toBeNull();
    expect(giftCaseOpenErrorCode(null)).toBeNull();
  });
});
