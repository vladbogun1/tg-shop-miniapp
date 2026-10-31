import { describe, expect, it } from "vitest";
import { toPercent } from "./percent";

describe("toPercent", () => {
  it.each([0, 0.5, 1, 12.345, 1e-7, -0.25, -3.3, 0.1 + 0.2, 0.92, 1 / 3])("%s — те же биты, что у x * 100", (x) => {
    expect(Object.is(toPercent(x), x * 100)).toBe(true);
  });
});
