import { describe, expect, it } from "vitest";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import { removedByReplace, replacingImport, withReplacedSpecs } from "./spec-replace";
import type { ProductReview } from "./types";

const review = (raw: unknown, specs: Record<string, unknown>): ProductReview => {
  const r = reviewProduct("p0a1b2c3d", item({ categorySlug: "myshki-wireless", specs }), raw, SCHEMA);
  if ("problems" in r) throw new Error("bad");
  return r;
};

describe("«Заменить характеристики целиком»", () => {
  const r = review({ specs: { color: "white", sensor: "PAW" }, confidence: { color: 90, sensor: 90 }, overall: 90 }, { color: "black", weight_g: 60, sensor: "old" });

  it("удалит только то, чего нет в ответе ИИ", () => {
    expect(removedByReplace(r, SCHEMA).map((x) => x.key)).toEqual(["weight_g"]);
    expect(removedByReplace(r, SCHEMA)[0].label).not.toBe("");
  });

  it("неотмеченное из ответа остаётся прежним значением, отмеченное — новым, остальное уходит", () => {
    const specs = withReplacedSpecs(r, { color: "white" });
    expect(specs).toEqual({ color: "white", sensor: "old" });
  });

  it("пустые значения карточки не считаются характеристиками", () => {
    const empty = review({ specs: { color: "white" }, overall: 90 }, { color: "", weight_g: null });
    expect(removedByReplace(empty, SCHEMA)).toEqual([]);
    expect(withReplacedSpecs(empty, {})).toEqual({});
  });

  it("запись с заменой: поверх выбранного — набор из ответа; ничего не отмечено — одни характеристики", () => {
    const chosen = { productId: r.item.id, specs: { color: "white" }, confidence: { color: 90 }, markReady: true };
    expect(replacingImport(r, chosen)).toEqual({ ...chosen, specs: { color: "white", sensor: "old" } });
    expect(replacingImport(r, null)).toEqual({ productId: r.item.id, specs: { color: "black", sensor: "old" }, confidence: {}, markReady: false });
    const nothing = review({ specs: { color: "white" }, overall: 90 }, { color: "black" });
    expect(replacingImport(nothing, null)).toBeNull();
  });
});
