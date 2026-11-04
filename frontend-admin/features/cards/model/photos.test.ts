import { describe, expect, it } from "vitest";
import { groupByProduct } from "./photos";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import { defaultSel, mergeSel } from "./selection";
import type { ProductReview } from "./types";

const ANSWER = {
  specs: {},
  title: { ru: "Мышь VGN F1", uk: "Мишка VGN F1", en: "VGN F1 Mouse" },
  overall: 90,
  photos: [
    "https://vgnlab.com/a.png",
    "https://vgnlab.com/a.png",
    "javascript:alert(1)",
    "ftp://x.com/b.jpg",
    { url: "https://cdn.example.com/b.webp" },
    "https://cdn.example.com/c.jpg",
    "https://cdn.example.com/d.jpg",
  ],
};

const review = (over = {}): ProductReview => {
  const r = reviewProduct("p0a1b2c3d", item(over), ANSWER, SCHEMA);
  if ("problems" in r) throw new Error("bad");
  return r;
};

describe("фото из ответа ИИ", () => {
  it("берёт только http(s), без повторов, объекты {url} тоже", () => {
    expect(review().photos).toEqual([
      "https://vgnlab.com/a.png",
      "https://cdn.example.com/b.webp",
      "https://cdn.example.com/c.jpg",
      "https://cdn.example.com/d.jpg",
    ]);
  });

  it("товар без фото — первые 3 отмечены, с фото — ни одного", () => {
    expect(defaultSel(review()).photos).toEqual(["https://vgnlab.com/a.png", "https://cdn.example.com/b.webp", "https://cdn.example.com/c.jpg"]);
    expect(defaultSel(review({ imageUrl: "products/x/1.webp" })).photos).toEqual([]);
  });

  it("перепроверка ответа сохраняет выбор админа, но выкидывает пропавшие ссылки", () => {
    const r = review();
    const old = { ...defaultSel(r), photos: ["https://cdn.example.com/d.jpg", "https://gone.example.com/x.jpg"] };
    expect(mergeSel(old, r).photos).toEqual(["https://cdn.example.com/d.jpg"]);
  });

  it("очередь: фото одного товара идут по порядку одной группой", () => {
    const jobs = [
      { productId: "a", title: "A", url: "1" },
      { productId: "b", title: "B", url: "2" },
      { productId: "a", title: "A", url: "3" },
    ];
    expect(groupByProduct(jobs).map((g) => g.map((j) => j.url))).toEqual([["1", "3"], ["2"]]);
  });
});
