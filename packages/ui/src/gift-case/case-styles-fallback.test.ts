import { describe, expect, it } from "vitest";
import { CASE_CSS } from "./case-styles";
import { CASE_CSS_FALLBACK, mixFallbackRules, rewriteMix } from "./case-styles-fallback";

describe("case UI color-mix fallback", () => {
  it("rewrites a mix with transparent into rgb(var(--x-rgb) / a), keeping the default colour", () => {
    expect(rewriteMix("color-mix(in srgb,var(--ga,#ff6a00) 22%,transparent)")).toBe("rgb(var(--ga-rgb,255 106 0) / 22%)");
    expect(rewriteMix("color-mix(in srgb,var(--rc) 14%,transparent)")).toBe("rgb(var(--rc-rgb) / 14%)");
  });
  it("turns a mix with white into a plain tint (no second colour needed)", () => {
    expect(rewriteMix("color-mix(in srgb,var(--rc) 85%,#fff)")).toBe("rgb(var(--rc-rgb) / 85%)");
    expect(rewriteMix("color-mix(in srgb,var(--ga,#ff6a00) 12%,rgba(255,255,255,.03))")).toBe("rgb(var(--ga-rgb,255 106 0) / 12%)");
  });
  it("covers every rule of the case CSS and leaves no color-mix behind", () => {
    const expected = (CASE_CSS.match(/color-mix\(/g) ?? []).length;
    expect(expected).toBeGreaterThan(0);
    expect(CASE_CSS_FALLBACK.startsWith("@supports not (color:color-mix")).toBe(true);
    expect(CASE_CSS_FALLBACK.slice(CASE_CSS_FALLBACK.indexOf("{") + 1)).not.toContain("color-mix(in");
    expect(mixFallbackRules(CASE_CSS).split("-rgb").length - 1).toBeGreaterThanOrEqual(expected);
  });
});
