import { describe, expect, it } from "vitest";
import { dayKey, shortOrderId } from "./format";

describe("format", () => {
  it("shortOrderId: first 8 hex chars of the uuid with a hash", () => {
    expect(shortOrderId("1c60c7c7-aaaa-bbbb-cccc-0123456789ab")).toBe("#1c60c7c7");
  });

  it("dayKey: groups by the viewer's calendar day, falls back to the raw string for garbage", () => {
    expect(dayKey("2026-09-07T12:00:00")).toBe("2026-8-7");
    expect(dayKey("not a date")).toBe("not a date");
  });
});
