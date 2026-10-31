import { describe, expect, it } from "vitest";
import { sharePercent } from "./percent";

describe("sharePercent", () => {
  it("rounds to a whole percent", () => {
    expect(sharePercent(0, 10)).toBe(0);
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(2, 3)).toBe(67);
    expect(sharePercent(1, 8)).toBe(13); // 12.5 -> 13
    expect(sharePercent(10, 10)).toBe(100);
  });
  it("matches the old inline formula on awkward values", () => {
    for (const [p, t] of [[0.5, 1], [12.345, 100], [1e-7, 1], [-1, 4]] as const) {
      expect(sharePercent(p, t)).toBe(Math.round((p / t) * 100));
    }
  });
});
