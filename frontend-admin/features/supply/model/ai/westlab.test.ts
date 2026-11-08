/**
 * Первый боевой черновик (08.11.2026, накладная WESTLAB): поиск не нашёл глайды и подсунул мусор к грипсам, и ИИ
 * предложил завести два товара, которые у нас уже были. Строки — как их прочитал ИИ на проде. Тот же набор, что
 * SupplyMatchWestLabTest.java.
 */
import { describe, expect, it } from "vitest";
import { autoMatch, candidatesOf, shortList } from "./match";
import { buildMatchPrompt, parseMatch, shortId } from "./match-prompt";
import type { CatalogItem, SourceLine } from "./types";

const item = (id: string, title: string, hidden = false): CatalogItem => ({ id, title, brand: "WestLab", categoryId: "c-glides", variants: [], imageUrl: null, hidden });
const dotsV2Black = item("8cad1a34-f42c-442c-9511-44e363beb526", "Глайды WestLab Universal Dots V2 черные 30 шт.");
const dotsBlue = item("af69c4a5-61ea-4a80-b3b0-163000bbb52d", "Глайды WestLab Universal Dots синие");
const dotsWhite = item("b1e5d0c2-0000-4a80-b3b0-163000bbb52e", "Глайды WestLab Universal Dots белые");
const grip = item("02520b5b-a520-4f92-8c6c-fa24bf9f66f3", "Грипсы WestLab Universal Grip Tape 0.2/0.55 мм", true);
const mat: CatalogItem = { id: "c181fb2f-7c4c-42e6-b5af-d762a459247b", title: "Ковер STAR SHADOW 1", brand: "Star", categoryId: "c-mats", variants: [], imageUrl: null };
const catalog = [dotsV2Black, dotsBlue, dotsWhite, grip, mat];

const line = (id: string, text: string, variant: string, en: string, brand: string, color: string | null, qty: number, unitPrice: number): SourceLine => ({
  id, text, variant, en, brand, model: null, color, qty, unitPrice, lineTotal: null, notes: null,
});
const l1 = line("L1", "西城WESTLAB小圆点脚贴 鼠标", "6.5mm微扁平型小圆点脚贴 30颗", "WESTLAB small round-dot mouse feet, 6.5 mm ultra-flat round-dot feet, 30 pcs", "WESTLAB", null, 20, 8.96);
const l2 = line("L2", "WEST LAB西城超薄聚氨酯防滑贴", "超薄聚氨酯防滑贴 1张", "WEST LAB ultra-thin polyurethane anti-slip pad, 1 sheet", "WEST LAB", null, 20, 7.4);
const l3 = line("L3", "西城WESTLAB特氟龙UPE鼠标脚", "【滑】蓝色小圆点20粒[PTFE+降噪]", "WESTLAB Teflon UPE mouse feet, [Slippery] blue small round dots, 20 pcs [PTFE + noise reduction]", "WESTLAB", "blue", 50, 4.63);

const ids = (l: SourceLine) => candidatesOf(l, catalog).map((c) => c.productId);

describe("поиск по накладной WESTLAB", () => {
  it("размеры и штуки — не коды модели: глайды находятся, ковёр нет", () => {
    expect(ids(l1)).toEqual(expect.arrayContaining([dotsV2Black.id, dotsBlue.id, dotsWhite.id]));
    expect(ids(l1)).not.toContain(mat.id);
  });

  it("бренд с пробелом и английское родовое слово находят грипсы первыми", () => {
    expect(ids(l2)[0]).toBe(grip.id);
  });

  it("цвет ставит нужный товар первым, но при девяти цветах это не уверенность", () => {
    const m = autoMatch(l3, catalog, []);
    expect(m.candidates[0].productId).toBe(dotsBlue.id);
    expect(m.decision.kind).toBe("open");
  });
});

describe("шаг 2 с каталогом целиком", () => {
  it("каталог — по категориям, до строк, скрытые помечены", () => {
    const cats = [{ id: "c-glides", slug: "glaydy", name: "Глайды" }, { id: "c-mats", slug: "kovriki", name: "Коврики" }];
    const prompt = buildMatchPrompt([{ line: l1, decision: { kind: "open" }, candidates: candidatesOf(l1, catalog) }], catalog, cats);
    expect(prompt).toContain(`### Глайды\n- ${shortId(dotsV2Black.id)}`);
    expect(prompt).toContain(`${shortId(grip.id)} | Грипсы WestLab Universal Grip Tape 0.2/0.55 мм | скрыт`);
    expect(prompt.indexOf("## Наш каталог")).toBeLessThan(prompt.indexOf("## Строки"));
  });

  it("любой товар каталога принимается, «choose» оставляет строку открытой с коротким списком", () => {
    const answer = "```json\n" + JSON.stringify({ L1: { choose: [shortId(dotsV2Black.id), "pdeadbeef"], notes: "цвет не указан" }, L2: { product: shortId(grip.id) } }) + "\n```";
    const a = parseMatch(answer, catalog, []);
    expect(a.decisions.get("L2")).toEqual({ kind: "match", productId: grip.id, variantId: null, by: "ai" });
    expect(a.decisions.has("L1")).toBe(false);
    expect(a.choices.get("L1")).toEqual([dotsV2Black.id]);
    expect(a.errors).toEqual(["L1: товара pdeadbeef нет в каталоге"]);
    expect(shortList(l1, a.choices.get("L1")!, catalog)).toEqual([{ productId: dotsV2Black.id, variantId: null, score: 1, ai: true }]);
  });
});
