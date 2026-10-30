import { describe, expect, it } from "vitest";
import { COMPARE_MAX_PER_GROUP, COMPARE_MAX_TOTAL, COMPARE_OTHER_GROUP, compareAdd, onlyDifferences, parseCompareEntries, type CompareEntry, type CompareSection } from "./compare";

const entry = (id: string, group = "g"): CompareEntry => ({ id, group, addedAt: 1 });

describe("compareAdd", () => {
  it("adds with the given timestamp and reports 'exists' without changing the list", () => {
    const r = compareAdd([], "a", "g", 42);
    expect(r).toEqual({ entries: [{ id: "a", group: "g", addedAt: 42 }], result: "added" });
    const again = compareAdd(r.entries, "a", "g", 43);
    expect(again.result).toBe("exists");
    expect(again.entries).toBe(r.entries);
  });

  it("refuses beyond the per-group and the total limits", () => {
    const full = Array.from({ length: COMPARE_MAX_PER_GROUP }, (_, i) => entry(`a${i}`));
    expect(compareAdd(full, "x", "g").result).toBe("group-full");
    expect(compareAdd(full, "x", "other").result).toBe("added");
    const total = Array.from({ length: COMPARE_MAX_TOTAL }, (_, i) => entry(`t${i}`, `g${i}`));
    expect(compareAdd(total, "x", "new").result).toBe("total-full");
  });
});

describe("parseCompareEntries", () => {
  it("reads a stored list defensively", () => {
    expect(parseCompareEntries("nope")).toEqual([]);
    const parsed = parseCompareEntries([{ id: "a", group: "g", addedAt: 5 }, { id: "a" }, null, { id: "b" }, { group: "x" }]);
    expect(parsed).toEqual([
      { id: "a", group: "g", addedAt: 5 },
      { id: "b", group: COMPARE_OTHER_GROUP, addedAt: 0 },
    ]);
  });

  it("caps the list at the total limit", () => {
    const raw = Array.from({ length: COMPARE_MAX_TOTAL + 5 }, (_, i) => ({ id: `p${i}`, group: "g", addedAt: i }));
    expect(parseCompareEntries(raw)).toHaveLength(COMPARE_MAX_TOTAL);
  });
});

describe("onlyDifferences", () => {
  it("keeps differing rows and drops sections left empty", () => {
    const row = (key: string, differs: boolean) => ({ key, differs }) as unknown as CompareSection["rows"][number];
    const sections = [
      { key: "s1", label: "S1", rows: [row("a", false), row("b", true)] },
      { key: "s2", label: "S2", rows: [row("c", false)] },
    ] as CompareSection[];
    const out = onlyDifferences(sections);
    expect(out.map((s) => s.key)).toEqual(["s1"]);
    expect(out[0].rows.map((r) => r.key)).toEqual(["b"]);
  });
});
