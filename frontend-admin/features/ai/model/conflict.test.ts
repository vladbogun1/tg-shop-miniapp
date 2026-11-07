import { describe, expect, it } from "vitest";
import { conflictText, mostlyConflicted } from "./conflict";

describe("конфликт правок", () => {
  it("версия карточки не менялась — конфликта нет", () => {
    expect(conflictText("dpi", "7", "8", { start: { dpi: "6" }, versionChanged: false })).toBeNull();
  });

  it("со снимком: поле изменили после старта — «было 6 → стало 7 → ИИ предлагал 8»", () => {
    const text = conflictText("dpi", "7", "8", { start: { dpi: "6" }, versionChanged: true });
    expect(text).toContain("было 6 → стало 7 → ИИ предлагал 8");
  });

  it("со снимком: другие поля менялись, а это нет — не блокируем", () => {
    expect(conflictText("dpi", "6", "8", { start: { dpi: "6" }, versionChanged: true })).toBeNull();
  });

  it("со снимком: поле было пустым, его заполнили — тоже конфликт", () => {
    expect(conflictText("dpi", "7", "8", { start: { dpi: null }, versionChanged: true })).toContain("было пусто");
  });

  it("без снимка: блокируются только замены, пустое поле заполнить можно", () => {
    expect(conflictText("dpi", "7", "8", { start: null, versionChanged: true })).toContain("замена выключена");
    expect(conflictText("dpi", null, "8", { start: null, versionChanged: true })).toBeNull();
  });

  it("баннер — когда изменено не меньше половины предложенного", () => {
    expect(mostlyConflicted(3, 6)).toBe(true);
    expect(mostlyConflicted(2, 6)).toBe(false);
    expect(mostlyConflicted(0, 0)).toBe(false);
  });
});
