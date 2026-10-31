import { describe, expect, it } from "vitest";
import {
  countStaleTranslations,
  createBody,
  createErrors,
  editBody,
  effectiveStockOf,
  firstCreateError,
  initialForm,
  isCompareAtInvalid,
  stepError,
  stepValid,
  stockBaseOf,
  stockDrop,
  stockRaises,
} from "./form";
import { S } from "./steps";
import { product } from "./test-helpers";

const full = product({
  id: "p1",
  title: " Мышь ",
  description: "Описание",
  priceMinor: 125050,
  compareAtMinor: 150000,
  stock: 4,
  slug: "mysh",
  categoryId: "c1",
  brandRef: { id: "b1", name: "Lamzu" } as never,
  condition: "USED",
  conditionNote: "царапина",
  images: [
    { id: 2, url: "k2", sortOrder: 2 },
    { id: 1, url: "k1", sortOrder: 1 },
    { id: 3, sortOrder: 3 },
  ] as never,
  variants: [{ id: "v1", name: "Чёрная", stock: 3, sortOrder: 0 }] as never,
});

describe("initialForm", () => {
  it("новый товар: пустая форма, состояние NEW, остаток 0", () => {
    const f = initialForm(null);
    expect(f).toMatchObject({ title: "", priceMajor: "", stock: "0", active: false, condition: "NEW", categoryId: "", variants: [], imageKeys: [] });
    expect(f.brand).toEqual({ id: null, name: "" });
  });
  it("правка: деньги в гривнах, фото по sortOrder без пустых, id вариантов сохраняются", () => {
    const f = initialForm(full);
    expect(f.priceMajor).toBe("1250.5");
    expect(f.compareAtMajor).toBe("1500");
    expect(f.imageKeys).toEqual(["k1", "k2"]);
    expect(f.variants).toEqual([{ id: "v1", name: "Чёрная", stock: 3 }]);
    expect(f.brand).toEqual({ id: "b1", name: "Lamzu" });
  });
});

describe("остатки", () => {
  it("stockBaseOf и effectiveStockOf: с вариантами — сумма вариантов", () => {
    const f = initialForm(full);
    expect(stockBaseOf(f)).toEqual({ stock: 4, variants: { v1: 3 } });
    expect(effectiveStockOf(f)).toBe(3);
  });
  it("stockDrop без вариантов и с вариантами", () => {
    const f = { ...initialForm(product({ stock: 5 })), stock: "2" };
    expect(stockDrop(f, { stock: 5, variants: {} })).toBe(3);
    const fv = initialForm(full);
    fv.variants[0].stock = 1;
    expect(stockDrop(fv, stockBaseOf(initialForm(full)))).toBe(2);
  });
  it("stockRaises: null — товар без вариантов, иначе id варианта", () => {
    const f = { ...initialForm(product({ stock: 5 })), stock: "8" };
    expect(stockRaises(f, { stock: 5, variants: {} })).toEqual([null]);
    const fv = initialForm(full);
    fv.variants[0].stock = 9;
    expect(stockRaises(fv, { stock: 4, variants: { v1: 3 } })).toEqual(["v1"]);
    expect(stockRaises(initialForm(full), { stock: 4, variants: { v1: 3 } })).toEqual([]);
  });
});

describe("editBody", () => {
  const base = { base: { stock: 5, variants: {} }, attrKeys: null, stockReason: null };
  it("остаток уходит только если менялся, вместе с expectedStock", () => {
    const f = initialForm(product({ stock: 5 }));
    expect(editBody(f, base)).not.toHaveProperty("stock");
    expect(editBody({ ...f, stock: "3" }, base)).toMatchObject({ stock: 3, expectedStock: 5 });
  });
  it("в характеристиках остаются только ключи схемы категории", () => {
    const f = { ...initialForm(product()), specs: { dpi: 1, junk: 2 } as never };
    expect(editBody(f, { ...base, attrKeys: new Set(["dpi"]) }).specs).toEqual({ dpi: 1 });
    expect(editBody(f, base).specs).toEqual({ dpi: 1, junk: 2 });
  });
  it("бренд: id, иначе имя, иначе пустой brandId (очистить)", () => {
    const f = initialForm(product());
    expect(editBody({ ...f, brand: { id: "b1", name: "X" } }, base)).toMatchObject({ brandId: "b1" });
    expect(editBody({ ...f, brand: { id: null, name: " Новый " } }, base)).toMatchObject({ brandName: "Новый" });
    expect(editBody(f, base)).toMatchObject({ brandId: "" });
  });
  it("примечание к состоянию очищается у NEW; причина списания и overrides попадают в тело", () => {
    const f = { ...initialForm(product()), conditionNote: "x" };
    expect(editBody(f, base).conditionNote).toBe("");
    const body = editBody(f, { ...base, stockReason: { reason: "DEFECT", note: "n" } }, { active: false });
    expect(body).toMatchObject({ stockReason: "DEFECT", stockNote: "n", active: false });
  });
  it("варианты: пустые имена отбрасываются, неизменённые идут без остатка", () => {
    const f = initialForm(full);
    f.variants.push({ name: "  ", stock: 1 });
    const body = editBody(f, { ...base, base: stockBaseOf(initialForm(full)) });
    expect(body.variants).toEqual([{ id: "v1", name: "Чёрная" }]);
  });
});

describe("createBody / createErrors", () => {
  it("создание скрытое, остаток — эффективный", () => {
    const f = { ...initialForm(null), title: " Новый ", priceMajor: "10", stock: "3", categoryId: "c1" };
    expect(createBody(f)).toMatchObject({ title: "Новый", priceMinor: 1000, stock: 3, active: false, currency: "UAH" });
  });
  it("ошибки по порядку полей", () => {
    const errors = createErrors(initialForm(null), true);
    expect(firstCreateError(errors)).toBe("Укажите название");
    expect(errors).toMatchObject({ category: "Выберите категорию", price: "Укажите цену больше 0" });
    expect(createErrors({ ...initialForm(null), title: "a", categoryId: "c", priceMajor: "1", stock: "1" }, false).category).toBe("Выберите подкатегорию");
    expect(firstCreateError(createErrors({ ...initialForm(null), title: "a", categoryId: "c", priceMajor: "1" }, true))).toBeUndefined();
  });
});

describe("шаги", () => {
  it("старая цена должна быть больше текущей", () => {
    const f = { ...initialForm(null), priceMajor: "100", compareAtMajor: "100" };
    expect(isCompareAtInvalid(f)).toBe(true);
    expect(isCompareAtInvalid({ ...f, compareAtMajor: "150" })).toBe(false);
    expect(isCompareAtInvalid({ ...f, compareAtMajor: "" })).toBe(false);
  });
  it("stepValid / stepError", () => {
    const f = initialForm(null);
    expect(stepValid(S.basics, f, true)).toBe(false);
    expect(stepValid(S.basics, { ...f, title: "x" }, true)).toBe(true);
    expect(stepValid(S.pricing, { ...f, active: true }, true)).toBe(false);
    expect(stepError(S.pricing, { ...f, active: true })).toBe("Товару на витрине нужна цена больше 0");
    expect(stepValid(S.category, f, false)).toBe(false);
    expect(stepValid(S.review, f, false)).toBe(true);
    expect(stepError(S.review, f)).toBeUndefined();
  });
});

describe("countStaleTranslations", () => {
  const tr = [
    { entityType: "PRODUCT", entityId: "p1", field: "title" },
    { entityType: "PRODUCT", entityId: "p1", field: "description" },
    { entityType: "PRODUCT", entityId: "other", field: "title" },
    { entityType: "VARIANT", entityId: "v1", field: "name" },
  ];
  it("считает только тексты, которые правка реально меняет", () => {
    const f = initialForm(full);
    expect(countStaleTranslations({ ...f, title: full.title }, full, tr)).toBe(0);
    expect(countStaleTranslations({ ...f, title: "Другое" }, full, tr)).toBe(1);
    const renamed = { ...f, variants: [{ id: "v1", name: "Белая", stock: 3 }] };
    expect(countStaleTranslations({ ...renamed, description: "Новое" }, full, tr)).toBe(2);
  });
});
