import { describe, expect, it } from "vitest";
import { ratioText } from "./ratio-text";

describe("ratioText", () => {
  it.each([0, 0.5, 1, 1.005, 0.605, 0.615, 0.995, 2.675, 8.345, 12.345, 1e-7, 5e-324, 0.004999, 0.005, 123456.789, 2.5])("%s — как toFixed(2)", (x) => {
    expect(ratioText(x)).toBe(x.toFixed(2));
  });

  it("случайные отношения длин — как toFixed(2)", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 20000; i++) {
      const a = 1 + Math.floor(rnd() * 400);
      const b = 1 + Math.floor(rnd() * 400);
      expect(ratioText(a / b)).toBe((a / b).toFixed(2));
    }
  });
});
