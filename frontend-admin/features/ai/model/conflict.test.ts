import { describe, expect, it } from "vitest";
import { conflictText, conflictWithoutSnapshot, editedBanner, editTime, mostlyConflicted } from "./conflict";

// Полдень по UTC: в любом поясе от −11 до +11 «сегодня» у правки в 11:20 UTC и у часов теста совпадает.
const NOW = new Date("2026-11-07T12:00:00Z");
const IVAN = { name: "Иван", at: "2026-11-07T11:20:00Z" };
const ANNA = { name: "Анна", at: "2026-11-07T11:05:00Z" };
const HHMM = /в \d\d:\d\d/;

describe("конфликт правок с сервера", () => {
  it("поле не меняли — конфликта нет", () => {
    expect(conflictText("Вес", "55 г", { change: null, editors: [IVAN] }, NOW)).toBeNull();
  });

  it("один человек: «Иван изменил «Вес» в 14:20: было 60 г → стало 62 г → ИИ предлагал 55 г»", () => {
    const text = conflictText("Вес", "55 г", { change: { before: "60 г", after: "62 г" }, editors: [IVAN] }, NOW)!;
    expect(text.startsWith("Иван изменил «Вес» в ")).toBe(true);
    expect(text).toMatch(HHMM);
    expect(text).toContain(": было 60 г → стало 62 г → ИИ предлагал 55 г");
  });

  it("несколько человек: журнал не знает, кто тронул поле, — называем всех и последнее время", () => {
    const text = conflictText("Вес", "55 г", { change: { before: null, after: "62 г" }, editors: [IVAN, ANNA] }, NOW)!;
    expect(text).toMatch(/^Карточку правили Иван, Анна \(последняя правка \d\d:\d\d\): было пусто → стало 62 г/);
  });

  it("в журнале никого (правка мимо журнала) — без имени; прежнее значение не назвать — без «было»", () => {
    const text = conflictText("Бренд", "Logitech", { change: { before: undefined, after: "Razer" }, editors: [] }, NOW);
    expect(text).toBe("Изменено после запуска ИИ: стало Razer → ИИ предлагал Logitech");
  });

  it("правка не сегодня — с датой", () => {
    expect(editTime("2026-11-01T11:20:00Z", NOW)).not.toMatch(/^в /);
    expect(editTime(IVAN.at, NOW)).toMatch(HHMM);
  });

  it("старая задача без снимка: блокируются только замены, пустое поле заполнить можно", () => {
    expect(conflictWithoutSnapshot("7", true)).toContain("замена выключена");
    expect(conflictWithoutSnapshot(null, true)).toBeNull();
    expect(conflictWithoutSnapshot("7", false)).toBeNull();
  });

  it("плашка: кто правил и сколько предложенных полей задето", () => {
    expect(editedBanner([IVAN], 2, 7)).toBe("Пока работал ИИ, карточку правил Иван · 2 из 7 полей изменены — их ИИ не заменит");
    expect(editedBanner([IVAN, ANNA], 1, 21)).toBe("Пока работал ИИ, карточку правили Иван, Анна · 1 из 21 поля изменено — их ИИ не заменит");
    expect(editedBanner([], 0, 3)).toBe("Пока работал ИИ, но предложенных полей это не коснулось");
  });

  it("баннер «повторить» — когда изменено не меньше половины предложенного", () => {
    expect(mostlyConflicted(3, 6)).toBe(true);
    expect(mostlyConflicted(2, 6)).toBe(false);
    expect(mostlyConflicted(0, 0)).toBe(false);
  });
});
