import { describe, expect, it } from "vitest";
import {
  buildCardReview,
  checkDescription,
  checkText,
  checkValue,
  confidenceColor,
  editText,
  finalRu,
  formatValue,
  levelOf,
  matchOption,
  parseCardAnswer,
  parseNumberLoose,
  reviewProduct,
  sameValue,
  type ProductReview,
  type TextReview,
} from "./index";
import { SCHEMA, item } from "./fixtures";
import { assignCardIds } from "./item";
import { attributesForCategory } from "./schema";

const attrs = attributesForCategory(SCHEMA, "myshki-wireless");
const attr = (key: string) => attrs.find((a) => a.key === key)!;

describe("parseCardAnswer", () => {
  it("читает блок ```json и приводит ключи к нижнему регистру", () => {
    const r = parseCardAnswer('текст\n```json\n{ "P0A1B2C3D": { "specs": {} } }\n```');
    expect([...r.entries.keys()]).toEqual(["p0a1b2c3d"]);
    expect(r.errors).toEqual([]);
  });
  it("пустой ответ — пусто без ошибок; без JSON — ошибка", () => {
    expect(parseCardAnswer("  ")).toMatchObject({ errors: [], notes: [] });
    expect(parseCardAnswer("привет").errors).toEqual(["В ответе не найден JSON-объект в блоке кода."]);
  });
  it("убирает висячие запятые и «умные» кавычки, добавляет заметку", () => {
    const r = parseCardAnswer('```json\n{ "p0a1b2c3d": { "title": “x”, }, }\n```');
    expect(r.errors).toEqual([]);
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it("оборванный ответ: берёт только законченные товары", () => {
    const r = parseCardAnswer('```json\n{ "p0a1b2c3d": { "specs": {} }, "p1b2c3d4e": { "specs": { "a": ');
    expect([...r.entries.keys()]).toEqual(["p0a1b2c3d"]);
    expect(r.notes.join(" ")).toContain("ответ оборван");
  });
  it("дубль id с разным содержимым попадает в duplicates", () => {
    const r = parseCardAnswer('```json\n{ "p0a1b2c3d": { "a": 1 }, "p0a1b2c3d": { "a": 2 } }\n```');
    expect(r.duplicates.has("p0a1b2c3d")).toBe(true);
  });
  it("несколько блоков объединяются", () => {
    const r = parseCardAnswer('```json\n{ "p0a1b2c3d": {} }\n```\n```json\n{ "p1b2c3d4e": {} }\n```');
    expect(r.entries.size).toBe(2);
    expect(r.notes[0]).toContain("найдено блоков кода: 2");
  });
  it("не объект — ошибка", () => {
    expect(parseCardAnswer("```json\n[{ \"a\": 1 }]\n```").errors[0]).toContain("ожидался JSON-объект");
  });
});

describe("числа и опции", () => {
  it("parseNumberLoose", () => {
    expect(parseNumberLoose("51 г")).toBe(51);
    expect(parseNumberLoose("1 200,5")).toBe(1200.5);
    expect(parseNumberLoose("нет")).toBeNull();
    expect(parseNumberLoose(Infinity)).toBeNull();
  });
  it("matchOption: по значению, подписи и алиасу без учёта регистра", () => {
    const color = attr("color");
    expect(matchOption(color, "black")).toBe("black");
    expect(matchOption(color, "ЧЁРНЫЙ")).toBe("black");
    expect(matchOption(color, "чорний")).toBe("black");
    expect(matchOption(color, "красный")).toBeNull();
    expect(matchOption(color, " ")).toBeNull();
  });
});

describe("checkValue", () => {
  it("number: строка с единицей", () => {
    const r = checkValue(attr("weight_g"), "51 г");
    expect(r.value).toBe(51);
    expect(r.issues).toEqual([{ level: "info", text: "«51 г» → 51" }]);
  });
  it("number: вне диапазона и не число", () => {
    expect(checkValue(attr("weight_g"), -1).value).toBeUndefined();
    expect(checkValue(attr("weight_g"), "много").issues[0].text).toBe("не число");
  });
  it("number: объект min=max → число; разные → ошибка", () => {
    expect(checkValue(attr("weight_g"), { min: 5, max: 5 }).value).toBe(5);
    expect(checkValue(attr("weight_g"), { min: 5, max: 6 }).issues[0].text).toBe("диапазон, а нужно одно число");
  });
  it("range: число, строка, объект, min > max", () => {
    expect(checkValue(attr("dpi"), 800).value).toEqual({ min: 800, max: 800 });
    expect(checkValue(attr("dpi"), "50–30 000").value).toEqual({ min: 50, max: 30000 });
    expect(checkValue(attr("dpi"), { min: "100", max: 200 }).value).toEqual({ min: 100, max: 200 });
    expect(checkValue(attr("dpi"), { min: 9, max: 1 }).issues.at(-1)?.text).toBe("min 9 больше max 1");
    expect(checkValue(attr("dpi"), true).value).toBeUndefined();
  });
  it("enum: найден, алиас, неизвестный → unknownOptions", () => {
    const color = attr("color");
    expect(checkValue(color, "black").value).toBe("black");
    const r = checkValue(color, ["Белый"]);
    expect(r.value).toBe("white");
    expect(r.issues[0].level).toBe("info");
    const u = checkValue(color, "розовый");
    expect(u.value).toBeUndefined();
    expect(u.unknownOptions).toEqual(["розовый"]);
    expect(checkValue(color, 5).issues[0].text).toBe("нужна одна опция-строка");
  });
  it("multi: массив, строка, неизвестные отбрасываются", () => {
    expect(checkValue(attr("connectivity"), ["wired", "Bluetooth", "wired"]).value).toEqual(["wired", "bt"]);
    expect(checkValue(attr("connectivity"), "wired, bt").value).toEqual(["wired", "bt"]);
    const r = checkValue(attr("connectivity"), ["wired", "ir"]);
    expect(r.value).toEqual(["wired"]);
    expect(r.issues.at(-1)).toEqual({ level: "warn", text: "нет опций: «ir» — отброшены" });
    expect(checkValue(attr("connectivity"), ["ir"]).issues.at(-1)?.level).toBe("error");
    expect(checkValue(attr("connectivity"), 3).issues[0].text).toBe("нужен массив опций");
  });
  it("bool: слова и числа", () => {
    expect(checkValue(attr("rgb"), true).value).toBe(true);
    expect(checkValue(attr("rgb"), "Да").value).toBe(true);
    expect(checkValue(attr("rgb"), "ні").value).toBe(false);
    expect(checkValue(attr("rgb"), 1).value).toBe(true);
    expect(checkValue(attr("rgb"), "может").issues[0].text).toBe("нужно true / false");
  });
  it("text: число, пустая, длинная", () => {
    expect(checkValue(attr("sensor"), 3950).value).toBe("3950");
    expect(checkValue(attr("sensor"), "  PAW  ").value).toBe("PAW");
    expect(checkValue(attr("sensor"), " ").issues[0].text).toBe("пустая строка");
    expect(checkValue(attr("sensor"), "x".repeat(256)).issues[0].text).toBe("длиннее 255 символов");
  });
});

describe("formatValue и sameValue", () => {
  it("форматирует по типам", () => {
    expect(formatValue(undefined, null)).toBe("—");
    expect(formatValue(attr("rgb"), true)).toBe("да");
    expect(formatValue(attr("weight_g"), 51)).toBe("51 г");
    expect(formatValue(attr("connectivity"), ["bt", "x"])).toBe("Bluetooth, x");
    expect(formatValue(attr("connectivity"), [])).toBe("—");
    expect(formatValue(attr("dpi"), { min: 50, max: 50 })).toMatch(/^50/);
    expect(formatValue(attr("dpi"), { a: 1 })).toBe('{"a":1}');
    expect(formatValue(attr("sensor"), "PAW")).toBe("PAW");
  });
  it("sameValue не зависит от порядка массива и ключей", () => {
    expect(sameValue(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameValue({ min: 1, max: 2 }, { max: 2, min: 1 })).toBe(true);
    expect(sameValue(1, 2)).toBe(false);
  });
});

describe("тексты", () => {
  it("checkDescription: пропавшая оговорка и числа", () => {
    const it0 = item({ description: "Уценка, вскрытая упаковка. Вес 51 г, 800 мАч.", condition: "MARKDOWN" });
    const r = checkDescription(it0, "Хорошая мышь.", {});
    const texts = r.issues.map((i) => i.text);
    expect(texts).toContain("пропала оговорка: уценка, упаковка");
    expect(texts).toContain("товар уценён — в тексте об этом ни слова");
    expect(texts.some((t) => t.startsWith("пропали числа"))).toBe(true);
    expect(r.level).toBe("warn");
  });
  it("checkDescription: без изменений — без замечаний", () => {
    const r = checkDescription(item(), "Старое описание. Вес 51 г.", {});
    expect(r).toMatchObject({ changed: false, issues: [], level: "ok" });
  });
  it("checkDescription: числа из specs не считаются потерянными", () => {
    const r = checkDescription(item({ description: "Вес 51 г." }), "Лёгкая.", { weight_g: 51 });
    expect(r.issues).toEqual([]);
  });
  const draft = (over: Partial<TextReview>): TextReview => ({
    field: "title",
    from: "Мышь",
    ru: "Мышь",
    uk: "",
    en: "",
    aiRu: "Мышь",
    changed: false,
    issues: { ru: [], uk: [], en: [] },
    level: "ok",
    ...over,
  });
  it("checkText: название — пустое, длинное, переименование", () => {
    expect(checkText(draft({ ru: " " }), item(), {}).issues.ru[0].text).toBe("пустое название");
    expect(checkText(draft({ ru: "x".repeat(256) }), item(), {}).issues.ru[0].text).toBe("длиннее 255 символов");
    const r = checkText(draft({ ru: "Мышь 2" }), item(), {});
    expect(r.changed).toBe(true);
    expect(r.issues.ru[0].text).toBe("переименование");
  });
  it("checkText: нет перевода → предупреждение; причина уценки не меняется", () => {
    const r = checkText(draft({}), item(), {});
    expect(r.issues.uk[0].text).toBe("нет перевода — не сохранится");
    const c = checkText(draft({ field: "conditionNote", from: "Вскрыта", ru: "Вскрыта", aiRu: "Вскрытая" }), item(), {});
    expect(c.changed).toBe(false);
    expect(c.issues.ru[0].level).toBe("info");
    expect(finalRu(c)).toBe("Вскрыта");
  });
  it("levelOf", () => {
    expect(levelOf([])).toBe("ok");
    expect(levelOf([{ level: "info" }, { level: "warn" }])).toBe("warn");
    expect(levelOf([{ level: "warn" }, { level: "error" }])).toBe("error");
  });
  it("confidenceColor", () => {
    expect(confidenceColor(null)).toBe("var(--text-faint)");
    expect(confidenceColor(90)).toBe("var(--ok)");
    expect(confidenceColor(65)).toContain("color-mix");
    expect(confidenceColor(45)).toBe("var(--warn)");
    expect(confidenceColor(10)).toBe("var(--danger)");
  });
});

const must = (r: ReturnType<typeof reviewProduct>): ProductReview => {
  if ("problems" in r) throw new Error(r.problems.join());
  return r;
};

describe("reviewProduct", () => {
  it("не объект → problems", () => {
    expect(reviewProduct("p1", item(), [1], SCHEMA)).toEqual({ problems: ["значение не объект { specs, confidence, … }"] });
  });
  it("полный ответ: поля, уверенность, предложения, тексты, общая", () => {
    const r = must(
      reviewProduct(
        "p0a1b2c3d",
        item(),
        {
          category: "myshki-wireless",
          brand: "VGN",
          specs: { weight_g: "51 г", color: "розовый", unknown_key: 1, sensor: "PAW3950", dpi: null },
          confidence: { weight_g: 95, color: 0.5, sensor: 30 },
          field_sources: { weight_g: " https://vgn.com/x " },
          proposals: [{ key: "color", value: "Розовый", why: "нет" }, { key: "color", value: "новый" }, { key: "", value: "x" }],
          title: { ru: "Мышь VGN", uk: "Мишка VGN", en: "VGN Mouse" },
          description: "Новое описание",
          sources: ["https://a.com", "ftp://b"],
          notes: " заметка ",
          model: "gpt",
          overall: 0.9,
        },
        SCHEMA
      )
    );
    expect(r.id).toBe("p0a1b2c3d");
    expect(r.category).toBeNull();
    expect(r.brand).toBeNull();
    expect(r.targetCategory).toBe("myshki-wireless");
    expect(r.fields.map((f) => [f.key, f.level, f.preselect, f.confidence])).toEqual([
      ["color", "error", false, 50],
      ["weight_g", "ok", true, 95],
      ["sensor", "warn", false, 30],
      ["unknown_key", "error", false, null],
    ]);
    expect(r.fields.find((f) => f.key === "weight_g")?.src).toBe("https://vgn.com/x");
    expect(r.proposals.map((p) => [p.key, p.value, !!p.auto])).toEqual([
      ["color", "розовый", true],
      ["color", "новый", false],
    ]);
    expect(Object.keys(r.texts)).toEqual(["title", "description"]);
    expect(r.texts.title).toMatchObject({ ru: "Мышь VGN", changed: true });
    expect(r.texts.description).toMatchObject({ ru: "Новое описание", uk: "", changed: true });
    expect(r.sources).toEqual(["https://a.com"]);
    expect(r.notes).toBe("заметка");
    expect(r.model).toBe("gpt");
    expect(r.overall).toBe(90);
    expect(r.issues.map((i) => i.text)).toEqual(["полей отброшено: 2", "предложений новых опций: 2"]);
    expect(r.level).toBe("warn");
  });
  it("смена категории и бренда", () => {
    const r = must(reviewProduct("p1", item(), { category: "myshki", brand: "vgn", specs: { weight_g: 5 }, confidence: { weight_g: 90 }, overall: 80 }, SCHEMA));
    expect(r.category).toMatchObject({ from: "myshki-wireless", to: "myshki", valid: false });
    expect(r.category?.issues[0].text).toContain("не лист");
    expect(r.brand).toMatchObject({ valid: true, issues: [{ level: "info", text: "другой регистр" }] });
    const bad = must(reviewProduct("p1", item({ brand: "" }), { category: "kovriki", brand: "Новый", specs: { weight_g: 5 } }, SCHEMA));
    expect(bad.category).toMatchObject({ valid: true });
    expect(bad.targetCategory).toBe("kovriki");
    expect(bad.fields[0].level).toBe("error");
    expect(bad.brand?.issues[0].text).toBe("новый бренд");
    const none = must(reviewProduct("p1", item(), { category: "zzz" }, SCHEMA));
    expect(none.category?.issues[0].text).toContain("нет категории");
  });
  it("нечего применить → error", () => {
    const r = must(reviewProduct("p1", item(), { specs: "abc" }, SCHEMA));
    expect(r.level).toBe("error");
    expect(r.issues.map((i) => i.text)).toEqual([
      "«specs» не объект — пропущено",
      "нет общей уверенности",
      "нечего применить: нет ни одного корректного поля или текста",
    ]);
  });
  it("общая уверенность ниже 60 и вне 0..100", () => {
    const ok = { specs: { weight_g: 1 } };
    expect(must(reviewProduct("p1", item(), { ...ok, overall: 50 }, SCHEMA)).issues.map((i) => i.text)).toContain("общая уверенность 50 %");
    expect(must(reviewProduct("p1", item(), { ...ok, overall: 150 }, SCHEMA)).overall).toBe(100);
    expect(must(reviewProduct("p1", item(), { ...ok, overall: "много" }, SCHEMA)).issues[0].text).toBe("общая: уверенность не число");
  });
  it("conditionNote: только перевод, русский не меняется; без исходной причины — пропуск", () => {
    const withNote = must(reviewProduct("p1", item({ conditionNote: "вскрыта" }), { conditionNote: { ru: "вскрытая", uk: "відкрита", en: "opened" } }, SCHEMA));
    expect(withNote.texts.conditionNote).toMatchObject({ ru: "вскрыта", uk: "відкрита", en: "opened", aiRu: "вскрытая", changed: false });
    const without = must(reviewProduct("p1", item(), { conditionNote: { uk: "x" }, specs: { weight_g: 1 } }, SCHEMA));
    expect(without.texts.conditionNote).toBeUndefined();
  });
  it("editText пересчитывает текст и уровень товара", () => {
    const r = must(
      reviewProduct("p1", item(), { title: { ru: "Мышь тест", uk: "Мишка", en: "Mouse" }, specs: { weight_g: 1 }, confidence: { weight_g: 90 }, overall: 90 }, SCHEMA)
    );
    const e = editText(r, "title", "ru", "Другая");
    expect(e.texts.title).toMatchObject({ ru: "Другая", changed: true });
    expect(editText(r, "description", "ru", "x")).toBe(r);
  });
});

describe("buildCardReview", () => {
  const a = item({ id: "0a1b2c3d-0000-4000-8000-000000000001" });
  const b = item({ id: "1b2c3d4e-0000-4000-8000-000000000002", title: "Вторая" });
  const ids = assignCardIds([a.id, b.id]);
  it("сопоставляет id, неизвестные и дубли", () => {
    const parsed = parseCardAnswer(
      '```json\n{ "p0a1b2c3d": { "specs": { "weight_g": 1 }, "overall": 90 }, "p1b2c3d4e": 5, "pffffffff": {}, "p1b2c3d4e": 6 }\n```'
    );
    const r = buildCardReview(parsed, { schema: SCHEMA, items: [a, b], ids });
    expect(r.products.map((p) => p.id)).toEqual(["p0a1b2c3d"]);
    expect(r.unknown).toEqual(["pffffffff"]);
    expect(r.invalid.map((x) => x.id)).toEqual(["p1b2c3d4e"]);
  });
  it("терпимо к полному UUID и потерянной «p»", () => {
    const parsed = parseCardAnswer(
      '```json\n{ "0a1b2c3d": { "specs": { "weight_g": 1 } }, "1b2c3d4e-0000-4000-8000-000000000002": { "specs": { "weight_g": 1 } } }\n```'
    );
    const r = buildCardReview(parsed, { schema: SCHEMA, items: [a, b], ids });
    expect(r.products.map((p) => p.item.id)).toEqual([a.id, b.id]);
    expect(r.unknown).toEqual([]);
  });
});
