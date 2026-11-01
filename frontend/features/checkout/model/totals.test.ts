import { describe, expect, it } from "vitest";
import { stepIsValid } from "./totals";

describe("stepIsValid", () => {
  const base = { nameOk: true, phoneOk: true, delivery: "PICKUP" as const, warehouse: null, paid: false };
  it("contacts need name and phone", () => {
    expect(stepIsValid(0, base)).toBe(true);
    expect(stepIsValid(0, { ...base, phoneOk: false })).toBe(false);
  });
  it("delivery: pickup is enough, Nova Poshta needs a branch", () => {
    expect(stepIsValid(1, base)).toBe(true);
    expect(stepIsValid(1, { ...base, delivery: "NOVA_POSHTA" })).toBe(false);
  });
  it("payment needs a chosen option, the summary is always valid", () => {
    expect(stepIsValid(2, base)).toBe(false);
    expect(stepIsValid(2, { ...base, paid: true })).toBe(true);
    expect(stepIsValid(3, base)).toBe(true);
  });
});
