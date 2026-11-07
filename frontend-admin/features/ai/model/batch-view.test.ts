import { describe, expect, it } from "vitest";
import type { AiBatch } from "../api-batch";
import { barText, canResume, confirmView, finishedCount, isSafeKey, minutesText, moneyRange, pauseText, safeTotals, summaryText, undoLeft } from "./batch-view";

const batch = (o: Partial<AiBatch> = {}): AiBatch =>
  ({ id: 1, total: 30, queued: 15, running: 3, done: 10, empty: 1, badAnswer: 0, failed: 1, canceled: 0, status: "RUNNING", ...o }) as AiBatch;

describe("пакет в полосе", () => {
  it("считает законченные как всё минус очередь и работу", () => {
    expect(finishedCount(batch())).toBe(12);
    expect(barText(batch())).toBe("Идёт пакет: 12 из 30");
  });
  it("на паузе называет причину", () => {
    const b = batch({ status: "PAUSED", pauseReason: "LIMIT_DAY" });
    expect(barText(b)).toBe("Пауза: 12 из 30 · Дневной лимит исчерпан");
    expect(canResume(b)).toBe(true);
  });
  it("выключенный ИИ продолжить нельзя", () => {
    expect(canResume(batch({ status: "PAUSED", pauseReason: "DISABLED" }))).toBe(false);
    expect(canResume(batch())).toBe(false);
    expect(pauseText(undefined)).toBe("Пауза");
  });
});

describe("итог пакета", () => {
  it("показывает только ненулевые части, сбой — вместе с нечитаемым ответом", () => {
    expect(summaryText(batch({ done: 20, empty: 0, failed: 2, badAnswer: 1 }))).toBe("Готово 20 · Сбой 3");
    expect(summaryText(batch({ done: 0, empty: 0, failed: 0 }))).toBe("");
  });
});

describe("подтверждение", () => {
  const est = { count: 12, minutes: 25, fits: false, p50Minor: 2000, p90Minor: 3500, roomMinor: 1000 };
  it("админ без финансов видит только штуки и минуты", () => {
    const v = confirmView(12, est, false);
    expect(v.lead).toBe("12 карточек · около 25 мин");
    expect(v.money).toBeNull();
    expect(v.warn).toBeNull();
  });
  it("финансист видит диапазон и что лимита не хватит", () => {
    const v = confirmView(12, est, true);
    expect(v.money).toContain("–");
    expect(v.warn).toContain("не хватит");
    expect(confirmView(12, { ...est, fits: true }, true).warn).toBeNull();
  });
  it("до ответа сервера — одна строка", () => {
    expect(confirmView(5, undefined, true).lead).toBe("5 карточек");
  });
  it("минуты и диапазон читаются по-человечески", () => {
    expect(minutesText(0)).toBe("меньше минуты");
    expect(minutesText(90)).toBe("около 1 ч 30 мин");
    expect(minutesText(120)).toBe("около 2 ч");
    expect(moneyRange(500, 500)).toBe(moneyRange(500, 100));
  });
});

describe("отмена применения", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  it("показывает остаток срока", () => {
    expect(undoLeft("2026-11-08T09:00:00Z", now)).toBe("23 ч");
    expect(undoLeft("2026-11-07T10:40:00Z", now)).toBe("40 мин");
  });
  it("после срока и без срока — null", () => {
    expect(undoLeft("2026-11-07T09:00:00Z", now)).toBeNull();
    expect(undoLeft(undefined, now)).toBeNull();
  });
});

describe("безопасное применение", () => {
  it("безопасны только характеристики и описание", () => {
    expect(isSafeKey("spec:weight")).toBe(true);
    expect(isSafeKey("description")).toBe(true);
    expect(["title", "brand", "category"].some(isSafeKey)).toBe(false);
  });
  it("считает карточки, поля и возвращённое", () => {
    const a = (changed: string[], notSafe: string[]) => ({ id: 1, jobId: 1, subjectId: "p", changed, notSafe, undoUntil: "" });
    expect(safeTotals([a(["a", "b"], []), a(["c"], ["title"]), a([], [])])).toEqual({ cards: 2, fields: 3, reverted: 1 });
  });
});

describe("полоска хода", () => {
  it("процент законченных и ноль для пустого пакета", async () => {
    const { progressPercent } = await import("./batch-view");
    expect(progressPercent({ total: 30, queued: 15, running: 3 })).toBe(40);
    expect(progressPercent({ total: 0, queued: 0, running: 0 })).toBe(0);
  });
});
