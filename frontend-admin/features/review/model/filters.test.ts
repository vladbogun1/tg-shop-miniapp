import { describe, expect, it } from "vitest";
import {
  busyOn,
  countOf,
  extraFilterCount,
  pageAfterEmptied,
  parseRatings,
  parseReviewFilter,
  productTitleOf,
  publishedToast,
  reviewsSearch,
  toggleRating,
} from "./filters";
import type { AdminReview, AdminReviewPage } from "./types";

const page = (over: Partial<AdminReviewPage>): AdminReviewPage =>
  ({ items: [], page: 0, size: 30, totalPages: 0, total: 0, pendingCount: 2, publishedCount: 3, hiddenCount: 4, ...over }) as AdminReviewPage;

describe("review filters", () => {
  it("parseReviewFilter: регистр не важен, мусор отбрасывается", () => {
    expect(parseReviewFilter("hidden")).toBe("HIDDEN");
    expect(parseReviewFilter("nope")).toBeUndefined();
    expect(parseReviewFilter(null)).toBeUndefined();
  });

  it("countOf: «Все» — сумма трёх", () => {
    const d = page({});
    expect([countOf(d, "PENDING"), countOf(d, "PUBLISHED"), countOf(d, "HIDDEN"), countOf(d, "ALL")]).toEqual([2, 3, 4, 9]);
    expect(countOf(undefined, "ALL")).toBeUndefined();
  });

  it("pageAfterEmptied: пустая последняя страница → предыдущая", () => {
    expect(pageAfterEmptied(page({ totalPages: 2 }), 2)).toBe(1);
    expect(pageAfterEmptied(page({ totalPages: 0 }), 1)).toBe(0);
    expect(pageAfterEmptied(page({ totalPages: 3 }), 1)).toBeNull();
    expect(pageAfterEmptied(page({}), 0)).toBeNull();
  });

  it("reviewsSearch: значения по умолчанию в ссылку не попадают", () => {
    expect(reviewsSearch("PENDING", null)).toBe("");
    expect(reviewsSearch("HIDDEN", "p1")).toBe("?status=HIDDEN&productId=p1");
  });

  it("reviewsSearch: поиск, оценки и «Без ответа» попадают в ссылку, пустой поиск — нет", () => {
    expect(reviewsSearch("PENDING", null, { q: "  мышь ", ratings: [1, 2], unanswered: true })).toBe("?q=%D0%BC%D1%8B%D1%88%D1%8C&ratings=1%2C2&unanswered=1");
    expect(reviewsSearch("PENDING", null, { q: "   ", ratings: [], unanswered: false })).toBe("");
  });

  it("toggleRating: включает и выключает, держит порядок", () => {
    expect(toggleRating([], 3)).toEqual([3]);
    expect(toggleRating([3], 1)).toEqual([1, 3]);
    expect(toggleRating([1, 3], 3)).toEqual([1]);
  });

  it("parseRatings: только 1..5 без повторов, мусор отбрасывается", () => {
    expect(parseRatings("3,1,3,9,x,0,2.5")).toEqual([1, 3]);
    expect(parseRatings(null)).toEqual([]);
    expect(parseRatings("")).toEqual([]);
  });

  it("extraFilterCount: поиск, оценки, «Без ответа» — по одному", () => {
    expect(extraFilterCount({ q: " ", ratings: [], unanswered: false })).toBe(0);
    expect(extraFilterCount({ q: "x", ratings: [1, 2], unanswered: true })).toBe(3);
  });

  it("publishedToast: про бонус — только если есть заказ", () => {
    expect(publishedToast(false)).toBe("Отзыв опубликован");
    expect(publishedToast(true)).toContain("бонусный промокод");
  });
});

describe("review helpers", () => {
  const r = { id: 1, productId: "p", productTitle: "Мышь" } as AdminReview;
  it("productTitleOf: без фильтра null, без отзывов «Товар»", () => {
    expect(productTitleOf([r], null)).toBeNull();
    expect(productTitleOf([r], "p")).toBe("Мышь");
    expect(productTitleOf([], "p")).toBe("Товар");
  });
  it("busyOn: только над открытым отзывом", () => {
    expect(busyOn({ id: 1, action: "hide" }, r)).toBe("hide");
    expect(busyOn({ id: 2, action: "hide" }, r)).toBeNull();
    expect(busyOn(null, r)).toBeNull();
  });
});
