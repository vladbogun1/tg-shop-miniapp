import { describe, expect, it } from "vitest";
import { newProducts, planProblems, resolvedLines } from "./plan";
import type { ReviewRow } from "./types";
import { lineVariants } from "./variants";

/** Те же случаи, что SupplyVariantsTest.java. */
const row = (id: string, text: string, variant: string | null, en: string | null, chosen: string | null): ReviewRow => ({
  line: { id, text, variant, en, brand: null, model: null, color: null, qty: 1, unitPrice: 200, lineTotal: null, notes: null },
  decision: { kind: "new", draft: { title: "X-raypad Origin Pro black", brand: "X-raypad", categoryId: "c", variant: chosen, source: null } },
  candidates: [],
});

const TEXT = "X-raypad Origin Pro 鼠标垫";
const SOFT = row("L1", TEXT, "Soft 黑色", "Origin Pro mouse pad, black, Soft", null);
const SOFT_TUBE = row("L2", TEXT, "Soft 黑色 礼盒装", "Origin Pro mouse pad, black, Soft, gift tube packaging", null);
const XSOFT = row("L3", TEXT, "XSoft 黑色", "Origin Pro mouse pad, black, XSoft", null);

describe("варианты строк нового товара", () => {
  it("разные позиции получают слова, которыми отличаются", () => {
    const v = lineVariants([SOFT, SOFT_TUBE, XSOFT]);
    expect(Object.fromEntries(v)).toEqual({ L1: "Soft", L2: "Soft gift tube packaging", L3: "XSoft" });
    expect(newProducts([SOFT, SOFT_TUBE, XSOFT])[0].variants).toEqual(["Soft", "Soft gift tube packaging", "XSoft"]);
  });

  it("одна и та же позиция дважды — без варианта, складывается, приём не блокируется", () => {
    const again = row("L4", TEXT, SOFT.line.variant, SOFT.line.en, null);
    expect(lineVariants([SOFT, again]).size).toBe(0);
    const plans = newProducts([SOFT, again], { "x-raypad origin pro black": 1000 });
    expect(planProblems([SOFT, again], plans)).toEqual([]);
  });

  it("вариант админа главнее и покрывает ту же позицию", () => {
    const named = row("L1", TEXT, SOFT.line.variant, SOFT.line.en, "Soft");
    const again = row("L4", TEXT, SOFT.line.variant, SOFT.line.en, null);
    const tube = row("L2", TEXT, SOFT_TUBE.line.variant, SOFT_TUBE.line.en, "Soft · тубус");
    expect(Object.fromEntries(lineVariants([named, again, tube]))).toEqual({ L1: "Soft", L4: "Soft", L2: "Soft · тубус" });
  });

  it("совпавшие слова у разных позиций — номер строки", () => {
    const a = row("L1", "Pad A", null, "pad black", null);
    const b = row("L2", "Pad B", null, "pad black", null);
    expect(Object.fromEntries(lineVariants([a, b]))).toEqual({ L1: "L1", L2: "L2" });
  });

  it("созданный товар: строки находят свои варианты", () => {
    const created = new Map([["x-raypad origin pro black", { productId: "p1", variants: [
      { id: "v1", name: "Soft" }, { id: "v2", name: "Soft gift tube packaging" }, { id: "v3", name: "XSoft" }] }]]);
    expect(resolvedLines([SOFT, SOFT_TUBE, XSOFT], created).map((r) => r.variantId)).toEqual(["v1", "v2", "v3"]);
  });
});
