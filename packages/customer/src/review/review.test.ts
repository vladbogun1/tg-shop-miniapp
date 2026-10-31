import { describe, expect, it, vi } from "vitest";
import { createReviewApi, REVIEWS_PAGE_SIZE } from "./api";
import { reviewKeys } from "./keys";

describe("ключи отзывов", () => {
  it("Mini App без языка, сайт с языком: прежние формы", () => {
    expect(reviewKeys.mine()).toEqual(["me", "reviews", "mine"]);
    expect(reviewKeys.mine("uk")).toEqual(["me", "reviews", "mine", "uk"]);
    expect(reviewKeys.pending()).toEqual(["me", "reviews", "pending", "all"]);
    expect(reviewKeys.pending("o1")).toEqual(["me", "reviews", "pending", "o1"]);
    expect(reviewKeys.pending(undefined, "en")).toEqual(["me", "reviews", "pending", "en"]);
    expect(reviewKeys.pending("o1", "en")).toEqual(["me", "reviews", "pending", "en", "o1"]);
    expect(reviewKeys.product("p")).toEqual(["reviews", "product", "p"]);
  });
});

describe("api отзывов", () => {
  it("публичная лента без authed, остальное через него; страница по умолчанию 10", async () => {
    const http = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
    const spy = vi.fn();
    const authed = <T,>(call: () => Promise<T>) => {
      spy();
      return call();
    };
    const api = createReviewApi(http, authed);
    expect(REVIEWS_PAGE_SIZE).toBe(10);
    await api.productReviews("a b");
    expect(http.get).toHaveBeenCalledWith("/api/public/products/a%20b/reviews?page=0&size=10");
    expect(spy).not.toHaveBeenCalled();
    await api.pending("o 1");
    expect(http.get).toHaveBeenLastCalledWith("/api/me/reviews/pending?orderId=o%201");
    await api.mine();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
