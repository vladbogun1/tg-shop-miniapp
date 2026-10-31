import { describe, expect, it } from "vitest";
import { plural } from "./plural";
import { buildPrompt, PART_MAX_SOURCE_CHARS, PART_MAX_STRINGS, splitIntoParts } from "./prompt";
import { pendingCount } from "./stats";

describe("splitIntoParts", () => {
  it("пустой список — нет частей", () => {
    expect(splitIntoParts([])).toEqual([]);
  });

  it("делит по числу строк и сохраняет порядок", () => {
    const strings = Array.from({ length: PART_MAX_STRINGS + 1 }, (_, i) => ({ ru: "a", i }));
    const parts = splitIntoParts(strings);
    expect(parts.map((p) => p.length)).toEqual([PART_MAX_STRINGS, 1]);
    expect(parts[1][0].i).toBe(PART_MAX_STRINGS);
  });

  it("делит по размеру, а одна огромная строка получает свою часть", () => {
    const big = "x".repeat(PART_MAX_SOURCE_CHARS + 1);
    const parts = splitIntoParts([{ ru: "a" }, { ru: big }, { ru: "b" }]);
    expect(parts.map((p) => p.length)).toEqual([1, 1, 1]);
  });
});

describe("buildPrompt", () => {
  const body = (text: string) => JSON.parse(text.slice(text.lastIndexOf("```json\n") + 8, text.lastIndexOf("\n```")));

  it("в конце — JSON id → { kind, product?, ru }", () => {
    const text = buildPrompt(
      [
        { id: "t1", kind: "название товара", ru: "Ковер" },
        { id: "t2", kind: "вариант", product: "Ковер", ru: "Новые" },
      ],
      1,
      1
    );
    expect(body(text)).toEqual({
      t1: { kind: "название товара", ru: "Ковер" },
      t2: { kind: "вариант", product: "Ковер", ru: "Новые" },
    });
    expect(text).toContain("Всего строк: 2.");
  });

  it("при нескольких частях в шапке — номер части", () => {
    expect(buildPrompt([{ id: "t1", kind: "k", ru: "a" }], 2, 3)).toContain("Это часть 2 из 3 (1 строк).");
  });
});

describe("plural и pendingCount", () => {
  it("склонение русских числительных", () => {
    const f = (n: number) => plural(n, "текст", "текста", "текстов");
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(f)).toEqual([
      "текст",
      "текста",
      "текстов",
      "текстов",
      "текстов",
      "текст",
      "текста",
      "текстов",
      "текстов",
    ]);
  });

  it("pendingCount: по `texts`, а у старого бэкенда — по полям × языкам", () => {
    expect(pendingCount(undefined)).toBe(0);
    const counts = { missing: 2, stale: 1, translated: 0, unreviewed: 0 };
    const base = { locales: { uk: { ALL: counts }, en: { ALL: counts } } };
    expect(pendingCount({ ...base, texts: { missing: 5, stale: 3, review: 9, done: 9 } })).toBe(8);
    expect(pendingCount(base as never)).toBe(6);
  });
});
