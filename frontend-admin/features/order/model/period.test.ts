import { describe, expect, it } from "vitest";
import { periodLabel } from "./period";

describe("periodLabel", () => {
  it("names a preset by its option label", () => {
    expect(periodLabel({ range: "month" })).toBe("30 дней");
    expect(periodLabel({ range: "prevmonth" })).toBe("Прошлый месяц");
  });

  it("shows the dates of a custom period", () => {
    expect(periodLabel({ range: "custom", from: "2026-10-01", to: "2026-11-07" })).toBe("01.10 – 07.11");
  });
});
