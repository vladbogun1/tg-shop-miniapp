import { describe, expect, it } from "vitest";
import { countLabel } from "./map-label";

/** Прежняя реализация — эталон. */
const legacy = (n: number): string =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

describe("countLabel", () => {
  it("примеры", () => {
    expect(countLabel(0)).toBe("0");
    expect(countLabel(999)).toBe("999");
    expect(countLabel(1000)).toBe("1.0k");
    expect(countLabel(1450)).toBe("1.4k");
    expect(countLabel(9999)).toBe("10.0k");
    expect(countLabel(10_000)).toBe("10k");
    expect(countLabel(15_500)).toBe("16k");
  });
  it("бит-в-бит как toFixed на всём диапазоне до 120 000", () => {
    for (let n = 0; n < 120_000; n++) expect(countLabel(n)).toBe(legacy(n));
  });
});
