import { describe, expect, it } from "vitest";
import { isIosBelow, parseIosVersion } from "./ios-version";

describe("parseIosVersion", () => {
  it("reads major_minor and major.minor", () => {
    expect(parseIosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)")).toEqual([17, 2]);
    expect(parseIosVersion("... iPhone OS 15.4 ...")).toEqual([15, 4]);
  });
  it("is null without a version", () => {
    expect(parseIosVersion("Mozilla/5.0 (Windows NT 10.0)")).toBeNull();
  });
});

describe("isIosBelow 16.4 (Web Push threshold)", () => {
  const below = (ua: string) => isIosBelow(parseIosVersion(ua)!, 16, 4);
  it("16.3 is too old", () => expect(below("iPhone OS 16_3")).toBe(true));
  it("16.4 is enough", () => expect(below("iPhone OS 16_4")).toBe(false));
  it("16.10 is enough", () => expect(below("iPhone OS 16_10")).toBe(false));
  it("17.0 is enough", () => expect(below("iPhone OS 17_0")).toBe(false));
  it("15.8 is too old", () => expect(below("iPhone OS 15_8")).toBe(true));
});
