import { describe, expect, it } from "vitest";
import { fileSize } from "./money-form";
import { decimal1, marginPercent } from "./format";

// Сверка со старыми формулами: .toFixed(1).replace(".", ",") и ((p - c) / p) * 100.
describe("decimal1", () => {
  it("совпадает с toFixed(1) + запятая на типичных значениях", () => {
    for (const n of [0, 0.5, 0.04, 12.345, 1e-7, 33.333333, 99.95, 100, -12.34, -0.04, 1.25, 1234.56, -50]) {
      expect(decimal1(n)).toBe(n.toFixed(1).replace(".", ","));
    }
  });
});

describe("fileSize", () => {
  it("байты, КБ, МБ", () => {
    expect(fileSize(500)).toBe("500 Б");
    expect(fileSize(2048)).toBe("2 КБ");
    expect(fileSize(1536 * 1024)).toBe("1,5 МБ");
    expect(fileSize(1310720)).toBe("1,3 МБ");
    expect(fileSize(10 * 1024 * 1024)).toBe("10,0 МБ");
  });
});

describe("marginPercent", () => {
  it("совпадает с ((p - c) / p) * 100 бит-в-бит", () => {
    for (const [p, c] of [[10000, 6000], [9999, 3333], [100, 0], [100, 150], [12345, 6789], [1, 1]] as const) {
      expect(marginPercent(p, c)).toBe(((p - c) / p) * 100);
    }
  });
});
