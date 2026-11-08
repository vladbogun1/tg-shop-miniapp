import { describe, expect, it } from "vitest";
import { matchSubject, parseMatch } from "./match-prompt";
import type { ReviewRow, SourceLine } from "./types";

const line = (id: string, text: string, variant: string | null = null): SourceLine => ({
  id, text, variant, en: null, brand: null, model: null, color: null, qty: 1, unitPrice: 1, lineTotal: 1, notes: null,
});
const row = (l: SourceLine): ReviewRow => ({ line: l, decision: { kind: "open" }, candidates: [] });

describe("matchSubject — ключ задачи сопоставления", () => {
  it("тот же набор строк — тот же ключ, вписывается в subjectId сервера (≤ 64)", () => {
    const a = matchSubject([row(line("L1", "西城WESTLAB小圆点脚贴")), row(line("L3", "WESTLAB UPE", "蓝色"))]);
    const b = matchSubject([row(line("L1", "西城WESTLAB小圆点脚贴")), row(line("L3", "WESTLAB UPE", "蓝色"))]);
    expect(a).toBe(b);
    expect(a).toMatch(/^m[0-9a-f]{16}$/);
  });

  it("другой набор (строка решена вручную, другой вариант) — другой ключ", () => {
    const all = matchSubject([row(line("L1", "A")), row(line("L2", "B"))]);
    expect(matchSubject([row(line("L2", "B"))])).not.toBe(all);
    expect(matchSubject([row(line("L1", "A")), row(line("L2", "B", "red"))])).not.toBe(all);
  });
});

describe("parseMatch — пояснения ИИ", () => {
  it("notes возвращаются по номеру строки, даже если решения нет", () => {
    const a = parseMatch('```json\n{"l2": {"new": {"title": "Глайды X"}, "notes": "не уверен в цвете"}}\n```', [], []);
    expect(a.decisions.get("L2")).toEqual({ kind: "new", draft: { title: "Глайды X", brand: null, categoryId: null, variant: null, source: null } });
    expect(a.notes.get("L2")).toBe("не уверен в цвете");
  });
});
