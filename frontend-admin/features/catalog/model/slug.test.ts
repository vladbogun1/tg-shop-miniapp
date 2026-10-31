import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify (preview of backend SlugService)", () => {
  it("transliterates Russian and Ukrainian with their own tables", () => {
    expect(slugify("Мышь игровая")).toBe("mysh-igrovaya");
    expect(slugify("Гарна їжа")).toBe("harna-yizha");
  });

  it("keeps latin/digits, turns separators into one dash and special signs into words", () => {
    expect(slugify("Lamzu Atlantis 2 + case & box")).toBe("lamzu-atlantis-2-plus-case-and-box");
  });

  it("is empty for blank input and capped at 120 chars", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("a".repeat(300)).length).toBeLessThanOrEqual(120);
  });
});
