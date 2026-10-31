import { describe, expect, it } from "vitest";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import { defaultSel } from "./selection";
import type { ProductReview } from "./types";
import { bulkSelection, chosenFirst, levelCounts, missingFromAnswer, reasonRu, sortForWizard, translationTotals } from "./wizard";

const review = (raw: unknown): ProductReview => {
  const r = reviewProduct("p0a1b2c3d", item({ categorySlug: "myshki-wireless" }), raw, SCHEMA);
  if ("problems" in r) throw new Error("bad");
  return r;
};

describe("порядок и пакеты", () => {
  it("sortForWizard: по категории и названию, без категории в конце", () => {
    const list = [item({ id: "1", title: "Б", categorySlug: null }), item({ id: "2", title: "Я", categorySlug: "kovriki" }), item({ id: "3", title: "А", categorySlug: "kovriki" })];
    expect(sortForWizard(list, SCHEMA).map((i) => i.id)).toEqual(["3", "2", "1"]);
  });
  it("chosenFirst сохраняет порядок внутри групп", () => {
    const list = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    expect(chosenFirst(list, new Set(["c"])).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
  it("missingFromAnswer: только из пакетов, где хоть что-то ответили", () => {
    expect(missingFromAnswer([["p1", "p2"], ["p3", "p4"]], new Set(["p1"]))).toEqual(["p2"]);
    expect(missingFromAnswer([["p1"]], new Set())).toEqual([]);
  });
});

describe("отметки и итоги", () => {
  const r = review({ category: "myshki-wireless", specs: { color: "black" }, confidence: { color: 90 }, overall: 90 });
  it("bulkSelection", () => {
    const def = defaultSel(r);
    expect(bulkSelection("okwarn", r, undefined)).toEqual(def);
    expect(bulkSelection("none", r, undefined).on).toBe(false);
    const cur = { ...def, brand: false };
    expect(bulkSelection("none", r, cur)).toEqual({ ...cur, on: false });
    const strict = bulkSelection("80", r, undefined);
    expect(strict.on).toBe(true);
    expect([...strict.fields]).toEqual(["color"]);
    expect(bulkSelection("80", { ...r, overall: 70 }, undefined).on).toBe(false);
  });
  it("levelCounts и translationTotals", () => {
    expect(levelCounts([r]).ok + levelCounts([r]).warn + levelCounts([r]).error).toBe(1);
    expect(translationTotals([{ translated: { uk: 2, en: 1 }, skippedManual: 1 }, { translated: null }, {}])).toEqual({ uk: 2, en: 1, manual: 1 });
  });
  it("reasonRu", () => {
    expect(reasonRu("NOT_FOUND")).toBe("товар не найден");
    expect(reasonRu("not_a_number")).toBe("не число");
    expect(reasonRu("weird")).toBe("weird");
  });
});
