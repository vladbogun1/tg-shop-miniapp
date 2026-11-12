import { describe, expect, it } from "vitest";
import { stepIsValid, stepOfField } from "./totals";

describe("stepIsValid", () => {
  const base = { recipientOk: true, phoneOk: true, deliveryOk: true, paid: false };
  it("contacts need the recipient and the phone", () => {
    expect(stepIsValid(0, base)).toBe(true);
    expect(stepIsValid(0, { ...base, phoneOk: false })).toBe(false);
    expect(stepIsValid(0, { ...base, recipientOk: false })).toBe(false);
  });
  it("delivery follows deliveryOk", () => {
    expect(stepIsValid(1, base)).toBe(true);
    expect(stepIsValid(1, { ...base, deliveryOk: false })).toBe(false);
  });
  it("payment needs a chosen option, the summary is always valid", () => {
    expect(stepIsValid(2, base)).toBe(false);
    expect(stepIsValid(2, { ...base, paid: true })).toBe(true);
    expect(stepIsValid(3, base)).toBe(true);
  });
});

describe("stepOfField", () => {
  it("recipient and phone — step 1, address and comment — step 2", () => {
    expect([stepOfField("name"), stepOfField("phone"), stepOfField("address"), stepOfField("comment")]).toEqual([0, 0, 1, 1]);
  });
});
