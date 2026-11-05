import { describe, expect, it } from "vitest";
import { num, parseExtract } from "./parse";
import { mergeLines, newProducts, planProblems, variantSetProblems } from "./plan";
import { supplierByName } from "./supplier";
import type { ReviewRow, SourceLine } from "./types";

const line = (id: string, o: Partial<SourceLine> = {}): SourceLine => ({
  id, text: id, variant: null, en: null, brand: null, model: null, color: null, qty: 1, unitPrice: null, lineTotal: null, notes: null, ...o,
});

describe("числа из ответа ИИ", () => {
  it.each([
    [42, 42],
    ["¥1 234,50", 1234.5],
    ["$42.50", 42.5],
    ["1,234.50", 1234.5],
    ["1.234,50", 1234.5],
    ["1,234", 1234],
    ["0,125", 0.125],
    ["12,5 грн", 12.5],
    ["10 zł", 10],
    ["1 000 000", 1000000],
  ])("%s → %s", (raw, want) => expect(num(raw)).toBe(want));

  it.each(["12 pcs x2", "abc", "", "1.2.3,4,5", "--5"])("«%s» — не число", (raw) => expect(num(raw)).toBeNull());
});

describe("валюта", () => {
  const doc = (currency: string) => parseExtract(JSON.stringify({ currency, lines: [{ text: "a", qty: 1 }] })).doc;
  it("PLN и злотые понимаются", () => {
    expect(doc("PLN")?.currency).toBe("PLN");
    expect(doc("zł")?.currency).toBe("PLN");
    expect(doc("грн")?.currency).toBe("UAH");
  });
  it("непонятная валюта — null, без подстановки USD", () => expect(doc("¤")?.currency).toBeNull());
});

describe("слияние строк", () => {
  it("если у части строк нет цены — цены позиции нет (не размазывает чужую)", () => {
    const merged = mergeLines([
      { line: line("L1", { qty: 5, unitPrice: 10 }), productId: "p", variantId: null },
      { line: line("L2", { qty: 5, unitPrice: null }), productId: "p", variantId: null },
    ]);
    expect(merged).toEqual([{ productId: "p", variantId: null, qty: 10, unitPrice: null }]);
  });
});

describe("новый товар с вариантами", () => {
  const draft = (variant: string | null) => ({ kind: "new" as const, draft: { title: "Рукав X", brand: null, categoryId: "c", variant, source: null } });
  const rows: ReviewRow[] = [
    { line: line("L1"), decision: draft("M"), candidates: [] },
    { line: line("L2"), decision: draft(null), candidates: [] },
  ];

  it("строка без варианта у товара с вариантами — проблема до создания", () => {
    const plans = newProducts(rows).map((p) => ({ ...p, priceUah: 100 }));
    expect(planProblems(rows, plans)).toContain("«Рукав X»: у строки L2 не указан вариант (у товара есть варианты M)");
  });

  it("товар уже создан с другим набором вариантов — проблема", () => {
    const ok: ReviewRow[] = [rows[0], { ...rows[1], decision: draft("XL") }];
    const plans = newProducts(ok);
    const created = new Map([["рукав x", { productId: "p1", variants: [{ id: "v1", name: "M" }] }]]);
    expect(variantSetProblems(plans, created)).toEqual(["«Рукав X» уже создан с вариантами M — нет варианта XL. Верните варианты или закройте окно и начните заново"]);
    expect(variantSetProblems(plans, new Map())).toEqual([]);
  });
});

describe("поставщик по названию", () => {
  const list = [
    { id: 1, name: "Taobao Zpmax准枪电竞外设企业店" },
    { id: 2, name: "A" },
    { id: 3, name: "Lamzu" },
  ];
  it("точное совпадение и вхождение длинного названия", () => {
    expect(supplierByName(list, "lamzu ")).toBe("3");
    expect(supplierByName(list, "Zpmax准枪电竞外设企业店")).toBe("1");
  });
  it("короткое имя не цепляется ко всему подряд", () => {
    expect(supplierByName(list, "Aliexpress Store")).toBe("");
    expect(supplierByName(list, "")).toBe("");
    expect(supplierByName(list, null)).toBe("");
  });
});
