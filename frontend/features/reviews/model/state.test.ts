import { describe, expect, it } from "vitest";
import { reviewsScreenState } from "./state";

const idle = { isLoading: false, isError: false };
const base = { hasToken: true, queries: [idle, idle, idle] as [typeof idle, typeof idle, typeof idle], showPending: false, mineCount: 0, bonusCount: 0 };

describe("reviewsScreenState", () => {
  it("is loading until the token arrives or any query loads", () => {
    expect(reviewsScreenState({ ...base, hasToken: false }).loading).toBe(true);
    expect(reviewsScreenState({ ...base, queries: [idle, { isLoading: true, isError: false }, idle] }).loading).toBe(true);
  });
  it("is empty only when nothing at all is shown", () => {
    expect(reviewsScreenState(base).nothing).toBe(true);
    expect(reviewsScreenState({ ...base, mineCount: 1 }).nothing).toBe(false);
    expect(reviewsScreenState({ ...base, showPending: true }).nothing).toBe(false);
  });
  it("failed when any query failed", () => {
    expect(reviewsScreenState({ ...base, queries: [idle, idle, { isLoading: false, isError: true }] })).toMatchObject({ failed: true, nothing: false });
  });
});
