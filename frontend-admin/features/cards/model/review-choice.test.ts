import { describe, expect, it } from "vitest";
import { initialSelection } from "@/features/ai";
import { editReviewValue, reselectAfterCategory, reviewRows, toProductSel } from "./ai-card";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import { brandChoices, categoryChoices } from "./review-choice";
import { buildImportItem } from "./selection";
import type { ProductReview } from "./types";

function review(entry: unknown, it = item()): ProductReview {
  const r = reviewProduct("p1", it, entry, SCHEMA);
  if ("problems" in r) throw new Error(r.problems.join());
  return r;
}

const choices = { schema: SCHEMA, brands: ["VGN", "Lamzu", "ATK"] };
const ctx = { changes: null, versionChanged: false, neighbors: () => [] as number[], choices };

describe("категория и бренд в проверке — выбор из существующих", () => {
  it("строки предлагают только конечные категории (путём) и бренды каталога; без списков — не правятся", () => {
    expect(categoryChoices(SCHEMA)).toEqual([
      { value: "myshki-wireless", label: "Мышки › Беспроводные" },
      { value: "kovriki", label: "Коврики" },
    ]);
    expect(brandChoices([" VGN", "ATK", "VGN", ""]).map((c) => c.value)).toEqual(["ATK", "VGN"]);

    const r = review({ category: "mouse-pro", brand: "Vgn Gaming", specs: { sensor: "PAW3395" }, confidence: { sensor: 90 }, overall: 90 });
    const rows = reviewRows(r, ctx);
    const cat = rows.find((x) => x.key === "category")!;
    expect(cat).toMatchObject({ editable: "choice", before: "Мышки › Беспроводные", after: "mouse-pro", suspicion: "bad", value: "mouse-pro" });
    expect(rows.find((x) => x.key === "brand")).toMatchObject({ editable: "choice", before: "VGN", after: "Vgn Gaming" });
    expect(reviewRows(r, { ...ctx, choices: undefined }).find((x) => x.key === "category")!.editable).toBeUndefined();
  });

  it("другая категория: характеристики проверяются по её схеме, выбор характеристик — заново, запись меняет категорию", () => {
    const r = review({ category: "mouse-pro", specs: { sensor: "PAW3395", weight_g: 55 }, confidence: { sensor: 90, weight_g: 90 }, overall: 90 }, item({ categorySlug: "kovriki" }));
    // у ковриков нет «Сенсора»: поле — ошибка
    expect(r.fields.find((f) => f.key === "sensor")!.level).toBe("error");

    const out = editReviewValue(r, "category", "myshki-wireless", choices);
    expect(out.error).toBeNull();
    expect(out.review.targetCategory).toBe("myshki-wireless");
    expect(out.review.fields.find((f) => f.key === "sensor")!.level).not.toBe("error");
    const rows = reviewRows(out.review, { ...ctx, edited: new Set(["category"]) });
    expect(rows.find((x) => x.key === "category")).toMatchObject({ after: "Мышки › Беспроводные", suspicion: "none", edited: true });

    const sel = reselectAfterCategory(new Set(["title", "spec:old"]), rows);
    expect([...sel].sort()).toEqual([...new Set(["title", "category", ...initialSelection(rows)])].sort());
    const payload = buildImportItem(out.review, toProductSel(out.review, sel, { translations: false }), { markReady: false })!;
    expect(payload.categorySlug).toBe("myshki-wireless");
    expect(payload.specs).toMatchObject({ sensor: "PAW3395", weight_g: 55 });
  });

  it("бренд — только из списка, регистр как в каталоге; нынешние категорию и бренд «выбрать» нельзя", () => {
    const r = review({ category: "kovriki", brand: "Vgn Gaming", specs: {}, overall: 90 });
    const b = editReviewValue(r, "brand", "lamzu", choices);
    expect(b.error).toBeNull();
    expect(b.review.brand).toMatchObject({ from: "VGN", to: "Lamzu", valid: true });
    expect(editReviewValue(r, "brand", "Razer", choices).error).toMatch(/нет/);
    expect(editReviewValue(r, "brand", "VGN", choices).error).toMatch(/нынешний/);
    expect(editReviewValue(r, "category", "myshki-wireless", choices).error).toMatch(/нынешняя/);
    expect(editReviewValue(r, "category", "myshki", choices).error).toMatch(/конечную/);
    expect(editReviewValue(r, "category", "nope", choices).error).toMatch(/нет/);
    expect(editReviewValue(r, "category", "kovriki").error).toBeTruthy();
  });
});
