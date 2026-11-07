import { describe, expect, it } from "vitest";
import {
  applicable,
  buildGroups,
  chosen,
  counts,
  groupOf,
  groupOpenByDefault,
  initialSelection,
  isStale,
  outcomeCounts,
  selectedByGroup,
  sortChecks,
  toggled,
  type ReviewField,
} from "./review-model";

function field(key: string, patch: Partial<ReviewField> = {}): ReviewField {
  return {
    key,
    label: key,
    before: null,
    after: "1",
    confidence: 90,
    source: null,
    reason: null,
    suspicion: "none",
    humanLocked: false,
    lockNote: null,
    conflict: null,
    ...patch,
  };
}

const FIELDS: ReviewField[] = [
  field("weight"), // заполнит пустое
  field("dpi"), // заполнит пустое
  field("sensor", { before: "Pixart" }), // заменит
  field("battery", { suspicion: "warn", reason: "мало источников" }), // проверьте (жёлтое)
  field("memory", { suspicion: "bad", reason: "Единицы?" }), // проверьте (красное): нельзя применить
  field("color", { before: "чёрный", humanLocked: true, lockNote: "Иван правил 14:20" }), // замок
  field("size", { before: "6", conflict: "Изменено после запуска ИИ" }), // замок (конфликт)
];

describe("группы", () => {
  it("каждое поле попадает в одну группу по правилам дизайна", () => {
    expect(groupOf(FIELDS[0])).toBe("fill");
    expect(groupOf(FIELDS[2])).toBe("replace");
    expect(groupOf(FIELDS[3])).toBe("check");
    expect(groupOf(FIELDS[4])).toBe("check");
    expect(groupOf(FIELDS[5])).toBe("locked");
    expect(groupOf(FIELDS[6])).toBe("locked");
  });

  it("группы идут в порядке «Проверьте, Заполнит, Заменит, Не ИИ», пустые не показываются", () => {
    expect(buildGroups(FIELDS).map((g) => g.id)).toEqual(["check", "fill", "replace", "locked"]);
    expect(buildGroups([field("a")]).map((g) => g.id)).toEqual(["fill"]);
  });

  it("красное в «Проверьте» идёт выше жёлтого", () => {
    const checks = buildGroups(FIELDS)[0].fields;
    expect(sortChecks(checks).map((f) => f.key)).toEqual(["memory", "battery"]);
  });

  it("открыты: «Заполнит пустое» всегда, «Проверьте» при ≤ 5 полях, остальные свёрнуты", () => {
    expect(groupOpenByDefault("fill", 40)).toBe(true);
    expect(groupOpenByDefault("check", 5)).toBe(true);
    expect(groupOpenByDefault("check", 6)).toBe(false);
    expect(groupOpenByDefault("replace", 1)).toBe(false);
    expect(groupOpenByDefault("locked", 1)).toBe(false);
  });
});

describe("счётчик «N из M»", () => {
  it("сначала включено только «Заполнит пустое»; M не считает замок и красное", () => {
    const sel = initialSelection(FIELDS);
    expect([...sel].sort()).toEqual(["dpi", "weight"]);
    expect(counts(FIELDS, sel)).toEqual({ n: 2, m: 4, locked: 2 });
  });

  it("сумма включённых по группам = N = число на кнопке (после любых переключений)", () => {
    let sel = initialSelection(FIELDS);
    for (const f of FIELDS) sel = toggled(sel, f); // жмём каждую строку, в том числе замок и красное
    const c = counts(FIELDS, sel);
    const byGroup = selectedByGroup(FIELDS, sel);
    expect(Object.values(byGroup).reduce((a, b) => a + b, 0)).toBe(c.n);
    expect(chosen(FIELDS, sel)).toHaveLength(c.n);
    expect(c.n).toBeLessThanOrEqual(c.m);
  });

  it("замок и красное не включаются, даже если ключ попал в набор", () => {
    const forced = new Set(FIELDS.map((f) => f.key));
    expect(chosen(FIELDS, forced).map((f) => f.key).sort()).toEqual(["battery", "dpi", "sensor", "weight"]);
    expect(counts(FIELDS, forced).n).toBe(4);
    expect(applicable(FIELDS[4])).toBe(false);
    expect(toggled(new Set(), FIELDS[4]).size).toBe(0);
  });

  it("итог для сервера: принято N, отклонено M−N, под замком — остальное", () => {
    const sel = new Set(["weight", "sensor"]);
    expect(outcomeCounts(FIELDS, sel)).toEqual({ applied: 2, rejected: 2, edited: 0, ignoredLocked: 2 });
  });
});

describe("устаревание", () => {
  const now = Date.parse("2026-11-30T00:00:00Z");
  it("результат старше 14 дней помечается", () => {
    expect(isStale("2026-11-15T00:00:00Z", now)).toBe(true);
    expect(isStale("2026-11-16T12:00:00Z", now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
  });
});
