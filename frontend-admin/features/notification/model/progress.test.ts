import { describe, expect, it } from "vitest";
import { progressPercent } from "./progress";

describe("progressPercent", () => {
  it("как раньше: Math.round((done / total) * 100), пустая аудитория — 0", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(1, 8)).toBe(13);
    expect(progressPercent(7, 7)).toBe(100);
    expect(progressPercent(1, 1e7)).toBe(0);
  });
});
