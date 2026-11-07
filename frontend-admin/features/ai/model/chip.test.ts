import { describe, expect, it } from "vitest";
import type { AiSummary } from "../api";
import { chipView } from "./chip";

const base: AiSummary = { configured: true, enabled: true, featuresOn: ["CARD"], limit: "", running: 0, review: 0, problems: 0 };

describe("chipView", () => {
  it("нечего показывать — чипа нет", () => {
    expect(chipView(base)).toBeNull();
    expect(chipView(undefined)).toBeNull();
    expect(chipView({ ...base, configured: false, running: 2 })).toBeNull();
  });
  it("идёт > ждёт проверки > сбой", () => {
    expect(chipView({ ...base, running: 1, review: 2 })).toMatchObject({ running: true, waiting: 2 });
    expect(chipView({ ...base, review: 3 })?.label).toContain("3");
    expect(chipView({ ...base, problems: 1 })).toMatchObject({ problem: true, running: false });
  });
});
