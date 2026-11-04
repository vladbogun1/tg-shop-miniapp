import { describe, expect, it } from "vitest";
import { likelyRepeats, lineProblem, totalProblem } from "./checks";
import { autoMatch } from "./match";
import { buildMatchPrompt, parseMatch, shortId } from "./match-prompt";
import { parseExtract } from "./parse";
import { mergeLines, newProducts, planProblems, resolvedLines } from "./plan";
import type { CatalogItem, ReviewRow } from "./types";

const zp1Black: CatalogItem = { id: "11111111-aaaa-4000-8000-000000000001", title: "Коврик Zpmax ZP1 Advanced 490×420 чёрный", brand: "Zpmax", categoryId: "c-mats", variants: [], imageUrl: null };
const zp1Red: CatalogItem = { ...zp1Black, id: "11111111-aaaa-4000-8000-000000000002", title: "Коврик Zpmax ZP1 Advanced 490×420 красный" };
const zp2: CatalogItem = { ...zp1Black, id: "11111111-aaaa-4000-8000-000000000003", title: "Коврик Zpmax ZP2 490×420 синий" };
const sleeve: CatalogItem = {
  id: "22222222-bbbb-4000-8000-000000000001",
  title: "Рукав Zpmax 4.0 Ice с петлёй под палец (правая рука)",
  brand: "Zpmax",
  categoryId: "c-acc",
  variants: [{ id: "v-m", name: "M" }, { id: "v-xl", name: "XL" }],
  imageUrl: null,
};
const catalog = [zp1Black, zp1Red, zp2, sleeve];

const answer = (o: unknown) => "Вот:\n```json\n" + JSON.stringify(o) + "\n```";

const taobao = answer({
  supplier: "Zpmax准枪电竞外设企业店",
  currency: "¥",
  total: 943.48,
  lines: [
    { text: "Zpmax准枪ZP1控制鼠标垫FPS", variant: "ZP1 进阶版 黑色 尺寸490*420*4...", brand: "Zpmax", model: "ZP1 Advanced", color: "black", qty: 4, unitPrice: "¥134.67" },
    { text: "Zpmax准枪4.0 FPS游戏电竞冰", variant: "XL码 拇指开口款 单只", en: "4.0 ice sleeve, thumb hole, XL", brand: "Zpmax", model: "4.0 Ice", qty: 3, unitPrice: 43.9 },
    { text: "Zpmax准枪4.0 FPS游戏电竞冰", variant: "XL码 拇指开口款 单只", brand: "Zpmax", model: "4.0 Ice", qty: 3, unitPrice: 43.9 },
    { text: "Zpmax准枪ZP3速度电竞FPS", variant: "ZP3 山青色 490*420*4MM", brand: "Zpmax", model: "ZP3", color: "teal", qty: 4, unitPrice: 134.67, lineTotal: 538.68 },
    { text: "", qty: 2 },
  ],
});

describe("шаг 1: разбор и арифметика", () => {
  it("читает строки, валюту и цены строками, пропускает битую строку с ошибкой", () => {
    const p = parseExtract(taobao);
    expect(p.doc?.currency).toBe("CNY");
    expect(p.doc?.lines).toHaveLength(4);
    expect(p.doc?.lines[0].unitPrice).toBe(134.67);
    expect(p.errors).toHaveLength(1);
  });

  it("ловит перекрытие скринов и расхождение итога", () => {
    const doc = parseExtract(taobao).doc!;
    expect([...likelyRepeats(doc.lines)]).toEqual(["L3"]);
    expect(lineProblem(doc.lines[3])).toBeNull();
    expect(lineProblem({ ...doc.lines[3], lineTotal: 500 })).toContain("538.68");
    expect(totalProblem(doc)).toContain("разница");
    expect(totalProblem(doc, doc.lines.filter((l) => l.id !== "L3"))).not.toBeNull();
  });

  it("ответ без JSON — понятная ошибка", () => {
    expect(parseExtract("не могу прочитать").errors[0]).toContain("нет JSON");
  });
});

describe("сопоставление", () => {
  const lines = parseExtract(taobao).doc!.lines;

  it("находит тот же код модели и цвет, а не соседний цвет или ZP2", () => {
    const m = autoMatch(lines[0], catalog, []);
    expect(m.decision).toMatchObject({ kind: "match", productId: zp1Black.id, by: "search" });
  });

  it("товар с вариантами без угаданного варианта не принимает сам", () => {
    const m = autoMatch({ ...lines[1], variant: "单只", en: null }, catalog, []);
    expect(m.decision.kind).toBe("open");
    expect(m.candidates[0].productId).toBe(sleeve.id);
  });

  it("память поставщика важнее поиска", () => {
    const l = lines[3];
    const m = autoMatch(l, catalog, [{ sourceKey: "zpmax准枪zp3速度电竞fps | zp3 山青色 490*420*4mm", productId: zp2.id, variantId: null }]);
    expect(m.decision).toMatchObject({ kind: "match", productId: zp2.id, by: "memory" });
  });
});

describe("шаг 2 и итог", () => {
  const lines = parseExtract(taobao).doc!.lines;
  const rows: ReviewRow[] = lines.map((line) => ({ line, decision: { kind: "open" }, candidates: autoMatch(line, catalog, []).candidates }));
  const cats = [{ id: "c-mats", slug: "kovriki", name: "Коврики" }];

  it("промпт содержит только переданные строки и их кандидатов", () => {
    const prompt = buildMatchPrompt([rows[1]], catalog, cats);
    expect(prompt).toContain("L2");
    expect(prompt).toContain(shortId(sleeve.id));
    expect(prompt).not.toContain("### L1");
  });

  it("разбирает «товар + вариант» и «новый товар»", () => {
    const a = parseMatch(
      answer({
        L2: { product: shortId(sleeve.id), variant: "xl" },
        L4: { new: { title: "Коврик Zpmax ZP3 490×420 бирюзовый", brand: "Zpmax", category: "kovriki", variant: null } },
        L9: { product: "pdeadbeef" },
      }),
      catalog,
      cats,
    );
    expect(a.decisions.get("L2")).toMatchObject({ kind: "match", variantId: "v-xl", by: "ai" });
    expect(a.decisions.get("L4")).toMatchObject({ kind: "new", draft: { categoryId: "c-mats" } });
    expect(a.errors).toHaveLength(1);
  });

  it("складывает одинаковые позиции, новые товары группирует по названию", () => {
    const decided: ReviewRow[] = [
      { ...rows[1], decision: { kind: "match", productId: sleeve.id, variantId: "v-xl", by: "admin" } },
      { ...rows[2], decision: { kind: "match", productId: sleeve.id, variantId: "v-xl", by: "admin" } },
      { ...rows[3], decision: { kind: "new", draft: { title: "Коврик Zpmax ZP3", brand: "Zpmax", categoryId: null, variant: null, source: null } } },
      { ...rows[0], decision: { kind: "skip" } },
    ];
    const plans = newProducts(decided);
    expect(plans).toHaveLength(1);
    expect(planProblems(decided, plans)).toEqual(["«Коврик Zpmax ZP3»: выберите категорию", "«Коврик Zpmax ZP3»: черновая цена продажи"]);
    const created = new Map([[plans[0].key, { productId: "new-zp3", variants: [] }]]);
    const merged = mergeLines(resolvedLines(decided, created));
    expect(merged).toEqual([
      { productId: sleeve.id, variantId: "v-xl", qty: 6, unitPrice: 43.9 },
      { productId: "new-zp3", variantId: null, qty: 4, unitPrice: 134.67 },
    ]);
  });
});
