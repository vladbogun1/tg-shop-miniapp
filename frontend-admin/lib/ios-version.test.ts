import { describe, expect, it } from "vitest";
import { parseIosVersion } from "./ios-version";

describe("parseIosVersion", () => {
  it("reads major_minor and major.minor", () => {
    expect(parseIosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)")).toBe(17.02);
    expect(parseIosVersion("... iPhone OS 15.4 ...")).toBe(15.04);
  });
  it("keeps the legacy encoding: minor is a hundredth", () => {
    expect(parseIosVersion("iPhone OS 16_4")).toBe(16 + 4 / 100);
    expect(parseIosVersion("iPhone OS 16_10")).toBe(16.1);
  });
  it("is null without a version", () => {
    expect(parseIosVersion("Mozilla/5.0 (Windows NT 10.0)")).toBeNull();
  });
});
