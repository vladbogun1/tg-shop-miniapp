import { describe, expect, it } from "vitest";
import { hexChannels, tint, tintOver } from "./tint";

describe("tint", () => {
  it("builds an rgb() from the -rgb twin of a token", () => {
    expect(tint("var(--ok)", 16)).toBe("rgb(var(--ok-rgb) / 16%)");
  });
  it("takes plain hex colours too", () => {
    expect(tint("#22c55e", 50)).toBe("rgb(34 197 94 / 50%)");
    expect(hexChannels("#ffb627")).toBe("255 182 39");
  });
  it("lays the tint over an opaque base for `background`", () => {
    expect(tintOver("var(--danger)", 12, "var(--surface)")).toBe(
      "linear-gradient(rgb(var(--danger-rgb) / 12%), rgb(var(--danger-rgb) / 12%)), var(--surface)",
    );
  });
  it("refuses a colour it cannot split into channels", () => {
    expect(() => tint("red", 10)).toThrow();
  });
});
