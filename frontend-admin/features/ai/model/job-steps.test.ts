import { describe, expect, it } from "vitest";
import { activeStepText, stageOf, stagePercent } from "./job-steps";

describe("ход задачи по шагу сервера", () => {
  it("шаг → этап макета", () => {
    expect(stageOf(null)).toBe(0);
    expect(stageOf("Читаю задание")).toBe(0);
    expect(stageOf("Ищу: viper v3 specs")).toBe(1);
    expect(stageOf("Читаю страницу razer.com")).toBe(1);
    expect(stageOf("Разбираю найденное")).toBe(1);
    expect(stageOf("Пишу ответ")).toBe(2);
    expect(stageOf("Исправляю ответ")).toBe(2);
    expect(stageOf("Что-то новое")).toBe(0);
  });

  it("полоса растёт с этапом и не доходит до конца", () => {
    expect(stagePercent(0)).toBeLessThan(stagePercent(1));
    expect(stagePercent(2)).toBeLessThan(100);
  });

  it("строка «Идут»: очередь, этап, а у законченной — ничего", () => {
    expect(activeStepText({ status: "QUEUED", step: undefined })).toBe("в очереди");
    expect(activeStepText({ status: "RUNNING", step: "Читаю страницу razer.com" })).toBe("шаг «Ищу в интернете»");
    expect(activeStepText({ status: "RUNNING", step: undefined })).toBe("шаг «Читаю карточку»");
    expect(activeStepText({ status: "DONE", step: undefined })).toBeNull();
  });
});
