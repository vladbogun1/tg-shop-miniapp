import { describe, expect, it } from "vitest";
import { progressPercent, progressTitle, stoppedSummary } from "./progress";

describe("progressPercent", () => {
  it("как раньше: Math.round((done / total) * 100), пустая аудитория — 0", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(1, 8)).toBe(13);
    expect(progressPercent(7, 7)).toBe(100);
    expect(progressPercent(1, 1e7)).toBe(0);
  });
});

describe("остановка рассылки", () => {
  it("заголовок: идёт → останавливаем → остановлена / завершена", () => {
    expect(progressTitle({ running: true, stopRequested: false, stopped: false })).toBe("Идёт рассылка…");
    expect(progressTitle({ running: true, stopRequested: true, stopped: false })).toBe("Останавливаем рассылку…");
    expect(progressTitle({ running: false, stopRequested: true, stopped: true })).toBe("Рассылка остановлена");
    expect(progressTitle({ running: false, stopRequested: false, stopped: false })).toBe("Рассылка завершена");
  });
  it("сводка: сколько отправлено и сколько не ушло", () => {
    expect(stoppedSummary(620, 1225, 605)).toBe("Отправлено 605 из 1225, не ушло 605");
    expect(stoppedSummary(1300, 1225, 1200)).toBe("Отправлено 1200 из 1225, не ушло 0");
  });
});
