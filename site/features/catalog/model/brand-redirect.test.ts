import { describe, expect, it } from "vitest";
import { brandSlugsOf, isBrandFilterPath, rewriteBrandParam } from "./brand-redirect";

describe("brand slug redirects", () => {
  it("replaces an old slug and keeps the others and the order", () => {
    expect(rewriteBrandParam("lamzu,atk", { lamzu: "lamzu-gaming" })).toBe("lamzu-gaming,atk");
  });

  it("is null when no slug is an old one", () => {
    expect(rewriteBrandParam("lamzu,atk", {})).toBeNull();
    expect(rewriteBrandParam("", { lamzu: "x" })).toBeNull();
  });

  it("collapses duplicates after the replacement and ignores case and spaces", () => {
    expect(rewriteBrandParam(" Lamzu , lamzu-gaming", { lamzu: "lamzu-gaming" })).toBe("lamzu-gaming");
  });

  it("does not treat object prototype names as slugs", () => {
    expect(rewriteBrandParam("constructor", {})).toBeNull();
  });

  it("caps how many slugs are looked up", () => {
    expect(brandSlugsOf(Array.from({ length: 40 }, (_, i) => `b${i}`).join(","))).toHaveLength(20);
  });

  it("knows the pages where ?brand= is a link", () => {
    for (const p of ["/catalog", "/catalog/myshki", "/ru/catalog/myshki", "/en/search", "/search/"]) {
      expect(isBrandFilterPath(p)).toBe(true);
    }
    for (const p of ["/product/x", "/catalog/a/b", "/cart", "/uk/catalog"]) expect(isBrandFilterPath(p)).toBe(false);
  });
});
