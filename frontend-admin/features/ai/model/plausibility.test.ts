import { describe, expect, it } from "vitest";
import { plausibility, plausibilityReason, ratioToNeighbors } from "./plausibility";

const SSD = [128, 256, 256, 512, 256];

describe("plausibility", () => {
  it("256000 против соседей с 256 — красное: перепутаны единицы", () => {
    expect(plausibility(256000, SSD)).toBe("bad");
    expect(plausibilityReason(256000, SSD)).toContain("Единицы?");
  });

  it("512 при соседях 256 — нормально", () => {
    expect(plausibility(512, SSD)).toBe("ok");
    expect(plausibilityReason(512, SSD)).toBeNull();
  });

  it("в десять раз больше — жёлтое, в сто — красное, и в обе стороны", () => {
    expect(plausibility(2560, SSD)).toBe("warn");
    expect(plausibility(25.6, SSD)).toBe("warn");
    expect(plausibility(2.5, SSD)).toBe("bad");
  });

  it("соседей меньше трёх или нечисловое — не судим", () => {
    expect(plausibility(256000, [256, 512])).toBe("ok");
    expect(ratioToNeighbors(0, SSD)).toBeNull();
    expect(plausibility(256000, [0, -1, NaN, 256])).toBe("ok");
  });
});
