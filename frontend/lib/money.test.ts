import { describe, expect, it } from "vitest";
import { money } from "./money";

describe("Mini App money()", () => {
  it("binds the shared implementation: same rounding, currency sign stays", () => {
    expect(money(150000).replace(/\s/g, " ")).toMatch(/^1.500 ₴$/);
    expect(money(0)).toContain("₴");
  });
});
