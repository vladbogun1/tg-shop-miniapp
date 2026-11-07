import { describe, expect, it } from "vitest";
import { aiSettingViews, centsFromDollars, dollarLimitView, dollarsText } from "./setting-views";

const plain = (s: string | null) => s?.replace(/\s/g, " ");

describe("limits in dollars, stored in cents", () => {
  it("cents ↔ dollars", () => {
    expect(dollarsText("1000")).toBe("10");
    expect(dollarsText("250")).toBe("2,5");
    expect(dollarsText("5")).toBe("0,05");
    expect(centsFromDollars("10")).toBe("1000");
    expect(centsFromDollars(" 2,50 $")).toBe("250");
    expect(centsFromDollars("0.05")).toBe("5");
    expect(centsFromDollars("")).toBe("");
    expect(centsFromDollars("десять")).toBe("десять");
  });

  it("errors speak dollars", () => {
    const v = dollarLimitView(4200);
    expect(v.check("10")).toBeNull();
    expect(v.check("1,234")).toBe("Сумма в долларах, например 10 или 2,50");
    expect(v.check("")).toBe("Укажите сумму: 0 — без лимита");
    expect(v.check("100001")).toBe("Не больше 100000 $");
  });

  it("the hryvnia hint goes next to the dollars", () => {
    const v = aiSettingViews(42_000)["ai.monthLimitCents"];
    expect(plain(v.note("1000"))).toBe("≈ 420 ₴");
    expect(v.note("0")).toBe("без лимита");
    expect(aiSettingViews(null)["ai.dayLimitCents"].note("100")).toBeNull();
  });
});
