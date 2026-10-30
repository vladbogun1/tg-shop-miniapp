import { describe, expect, it } from "vitest";
import { shortOrderId } from "./format";

describe("format", () => {
  it("shortOrderId: first 8 hex chars of the uuid with a hash", () => {
    expect(shortOrderId("1c60c7c7-aaaa-bbbb-cccc-0123456789ab")).toBe("#1c60c7c7");
  });
});
