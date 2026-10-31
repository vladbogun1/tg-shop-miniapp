import { describe, expect, it } from "vitest";
import { catalogHref, clearFilters, hasFilters, stateFromParams } from "./params";

describe("catalog url state", () => {
  it("parses sort, page and the legacy priceMax link", () => {
    const s = stateFromParams("/catalog", { sort: "price_asc", page: "3", from: "2", priceMax: "1500" });
    expect(s).toMatchObject({ sort: "price_asc", page: 3, from: 2 });
    expect(s.filter.priceMax).toBe(1500);
  });

  it("falls back on junk: unknown sort, bad page, from >= page", () => {
    const s = stateFromParams("/catalog", { sort: "boom", page: "-4", from: "9" });
    expect(s).toMatchObject({ sort: "default", page: 1 });
    expect(s.from).toBeUndefined();
  });

  it("trims and caps the search text", () => {
    expect(stateFromParams("/search", { q: "  mouse  " }).filter.q).toBe("mouse");
    expect(stateFromParams("/search", { q: "x".repeat(300) }).filter.q).toHaveLength(100);
    expect(stateFromParams("/search", { q: "   " }).filter.q).toBeUndefined();
  });

  it("href leaves defaults out and round-trips the state", () => {
    expect(catalogHref(stateFromParams("/catalog", {}))).toBe("/catalog");
    const s = stateFromParams("/catalog", { sort: "new", page: "2", brand: "lamzu", inStock: "1" });
    const href = catalogHref(s);
    expect(href).toContain("sort=new");
    expect(href).toContain("page=2");
    const back = stateFromParams("/catalog", Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(back.filter.brands).toEqual(["lamzu"]);
    expect(back.filter.inStock).toBe(true);
  });

  it("hasFilters ignores the search text; clearFilters keeps it and resets paging", () => {
    const s = stateFromParams("/catalog", { q: "abc", brand: "x", page: "4" });
    expect(hasFilters({ q: "abc" })).toBe(false);
    expect(hasFilters(s.filter)).toBe(true);
    const c = clearFilters(s);
    expect(c.filter).toEqual({ q: "abc" });
    expect(c.page).toBe(1);
  });
});
