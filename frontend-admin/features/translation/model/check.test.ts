import { describe, expect, it } from "vitest";
import { blockingIssues, checkRuFix, checkTranslation, lineCount, normalizeAnswerText, sameText } from "./check";
import { wordDiff } from "./diff";
import { item } from "./fixtures";
import { parseAnswer } from "./parse";
import { buildReview } from "./review";
import { buildWorkSet } from "./workset";

const FENCE = "```";
const texts = (issues: { level: string; text: string }[]) => issues.map((i) => `${i.level}:${i.text}`);

describe("checkTranslation", () => {
  it("чистый перевод без замечаний", () => {
    expect(checkTranslation("Ковер Attack Shark 490 мм", "uk", "Килимок Attack Shark 490 мм")).toEqual([]);
  });

  it("пустой текст — ошибка и дальше не проверяется", () => {
    expect(texts(checkTranslation("Привет", "uk", "  "))).toEqual(["error:пусто"]);
  });

  it("число потеряно — ошибка, число появилось — предупреждение", () => {
    expect(texts(checkTranslation("Размер 490 мм", "uk", "Розмір мм"))).toContain("error:потеряно число: 490");
    expect(texts(checkTranslation("Размер мм", "uk", "Розмір 5 мм"))).toContain("warn:новое число: 5");
  });

  it("число строк должно совпадать", () => {
    expect(texts(checkTranslation("a\nb", "en", "a b"))).toContain("error:строк 1, а в оригинале 2");
  });

  it("плейсхолдеры шаблонов чата должны совпадать", () => {
    expect(texts(checkTranslation("Привет, {name}!", "uk", "Привіт, {імя}!"))).toContain("error:плейсхолдеры не совпадают: {name}");
  });

  it("латиница оригинала: для uk — ошибка, для en — предупреждение", () => {
    expect(texts(checkTranslation("Мышь MCHOSE", "uk", "Миша"))).toContain("error:нет латиницы из оригинала: MCHOSE");
    expect(texts(checkTranslation("Мышь MCHOSE", "en", "Mouse"))).toContain("warn:нет латиницы из оригинала: MCHOSE");
  });

  it("длина: слишком короткий и слишком длинный перевод", () => {
    const src = "Это достаточно длинный оригинальный текст для проверки";
    expect(texts(checkTranslation(src, "uk", "Це")).some((t) => t.startsWith("error:длина ×"))).toBe(true);
    expect(checkTranslation("Коротко", "en", "x".repeat(60)).map((i) => i.text)).toContain("перевод намного длиннее оригинала");
  });

  it("русские буквы в uk и кириллица в en", () => {
    expect(texts(checkTranslation("Мышь", "uk", "Мышка"))).toContain("error:русские буквы (ы/э/ъ/ё): Мышка");
    expect(texts(checkTranslation("Мышь", "en", "Мышь"))).toContain("warn:кириллица в английском: Мышь");
  });

  it("эмодзи должны совпадать по количеству", () => {
    expect(texts(checkTranslation("Привет 🔥", "en", "Hello"))).toContain("warn:эмодзи: 0 вместо 1");
  });
});

describe("вспомогательные", () => {
  it("lineCount не считает хвостовые пустые строки", () => {
    expect(lineCount("a\nb\n\n")).toBe(2);
  });
  it("normalizeAnswerText срезает внешние пробелы, которых нет в оригинале", () => {
    expect(normalizeAnswerText("abc", "  x  \r\n")).toBe("x");
    expect(normalizeAnswerText(" abc ", "  x  ")).toBe("  x  ");
  });
  it("sameText игнорирует хвостовые пробелы строк и края", () => {
    expect(sameText("a  \nb\n", "a\nb")).toBe(true);
    expect(sameText("a", "b")).toBe(false);
  });
  it("blockingIssues отдаёт только ошибки с языком", () => {
    expect(blockingIssues("Размер 490", ["uk", "en"], { uk: "Розмір", en: "Size 490" })).toEqual(["UK: потеряно число: 490"]);
  });
});

describe("checkRuFix", () => {
  it("безопасная правка проходит", () => {
    const r = checkRuFix("Это очень хорошая мышка для игры в шутеры", "Это очень хорошая мышка для игры в шутеры.");
    expect(r.issues).toEqual([]);
    expect(r.similarity).toBeGreaterThan(0.75);
  });
  it("правка чисел, пустая правка и сильная переписка — ошибки", () => {
    expect(texts(checkRuFix("Размер 490", "Размер 480").issues)).toContain("error:в правке изменены числа");
    expect(texts(checkRuFix("Привет", " ").issues)).toEqual(["error:правка пустая"]);
    expect(checkRuFix("один два три четыре", "совсем другой текст тут").issues.map((i) => i.text)[0]).toMatch(/^текст сильно переписан/);
  });
});

describe("wordDiff", () => {
  it("разбирает вставки и удаления по словам", () => {
    expect(wordDiff("a b c", "a x c")).toEqual([
      { type: "same", text: "a " },
      { type: "del", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: " c" },
    ]);
  });
  it("слишком длинные тексты не сравниваются", () => {
    const long = Array.from({ length: 2001 }, (_, i) => `w${i}`).join(" ");
    expect(wordDiff(long, "x")).toBeNull();
  });
});

describe("parseAnswer + buildReview", () => {
  const missing = { status: "MISSING" as const, text: null, origin: null };
  const ws = buildWorkSet([item({ entityId: "1", ...missing })], [item({ entityId: "1", ...missing })]);
  const id = ws.strings[0].id;

  it("читает блок json, чинит висячие запятые", () => {
    const p = parseAnswer(`текст\n${FENCE}json\n{ "${id}": { "ru": "a", "uk": "b", }, }\n${FENCE}`);
    expect(p.errors).toEqual([]);
    expect(p.notes).toEqual(["убраны висячие запятые"]);
    expect(p.entries.get(id)).toEqual({ ru: "a", uk: "b", problems: [] });
  });

  it("ответ без JSON — ошибка", () => {
    expect(parseAnswer("привет").errors).toEqual(["В ответе не найден JSON-объект в блоке кода."]);
  });

  it("повтор id с разным текстом попадает в duplicates", () => {
    const p = parseAnswer(`${FENCE}json\n{ "t123456": {"uk":"a"}, "t123456": {"uk":"b"} }\n${FENCE}`);
    expect(p.duplicates.has("t123456")).toBe(true);
  });

  it("buildReview: неизвестные id и чистая строка", () => {
    const answer = `${FENCE}json\n{ "${id}": { "ru": "Ковер Attack Shark черный", "uk": "Килимок Attack Shark чорний", "en": "Attack Shark Mouse Pad, Black" }, "t999999": { "uk": "x" } }\n${FENCE}`;
    const r = buildReview(parseAnswer(answer), ws);
    expect(r.unknown).toEqual(["t999999"]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ level: "ok", ruChanged: false, done: false });
  });

  it("buildReview: нет языка в ответе — ошибка строки", () => {
    const partial = buildReview(parseAnswer(`${FENCE}json\n{ "${id}": { "uk": "Килимок Attack Shark чорний" } }\n${FENCE}`), ws);
    expect(partial.rows[0].level).toBe("error");
    expect(texts(partial.rows[0].issues)).toContain("error:нет «en»");
  });
});
