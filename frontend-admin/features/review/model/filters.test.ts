import { describe, expect, it } from "vitest";
import { countOf, pageAfterEmptied, parseReviewFilter, publishedToast, reviewsSearch } from "./filters";
import type { AdminReviewPage } from "./types";

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

  it("publishedToast: про бонус — только если есть заказ", () => {
    expect(publishedToast(false)).toBe("Отзыв опубликован");
    expect(publishedToast(true)).toContain("бонусный промокод");
  });
});
