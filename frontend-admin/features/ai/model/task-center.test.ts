import { describe, expect, it } from "vitest";
import type { AiJob, AiTaskRow } from "../api";
import { EMPTY_TEXT, isStale, problemText, reviewHref, tabCount, taskRowView, taskTitle } from "./task-center";

const NOW = Date.parse("2026-11-07T12:00:00Z");

function job(over: Partial<AiJob> = {}): AiJob {
  return {
    id: 5,
    feature: "CARD",
    status: "DONE",
    outcome: "",
    errorCode: "",
    createdAt: "2026-11-07T10:00:00Z",
    finishedAt: "2026-11-07T10:01:00Z",
    ...over,
  } as AiJob;
}

const row = (over: Partial<AiJob> = {}, label = "Lamzu Atlantis"): AiTaskRow => ({ job: job(over), adminName: "Аня", subjectLabel: label });

describe("центр задач", () => {
  it("название: что сделал ИИ и над чем", () => {
    expect(taskTitle(row())).toBe("Карточка · Lamzu Atlantis");
    expect(taskTitle(row({}, ""))).toBe("Карточка");
  });

  it("в ревью ведёт только готовая карточка, которую ещё не разобрали", () => {
    expect(reviewHref(job())).toBe("/cards/ai-review/5");
    expect(reviewHref(job({ outcome: "APPLIED" }))).toBeNull();
    expect(reviewHref(job({ status: "RUNNING" }))).toBeNull();
    expect(reviewHref(job({ feature: "TRANSLATION" }))).toBeNull();
  });

  it("ждущий больше двух недель помечен «может устареть»", () => {
    const old = job({ finishedAt: "2026-10-20T10:00:00Z" });
    expect(isStale(old, NOW)).toBe(true);
    expect(isStale(job(), NOW)).toBe(false);
    expect(taskRowView(row({ finishedAt: "2026-10-20T10:00:00Z" }), NOW).stale).toBe(true);
    expect(taskRowView(row({ finishedAt: "2026-10-20T10:00:00Z", outcome: "APPLIED" }), NOW).stale).toBe(false);
  });

  it("деньги в строке только если сервер их прислал", () => {
    expect(taskRowView(row(), NOW).costMinor).toBeNull();
    expect(taskRowView(row({ costMinor: 250 }), NOW).costMinor).toBe(250);
  });

  it("проблема описана словами, без кодов", () => {
    expect(problemText({ status: "EMPTY", errorCode: "" })).toBe("ИИ не нашёл данных по товару");
    expect(problemText({ status: "BAD_ANSWER", errorCode: "" })).toBe("Ответ ИИ не удалось разобрать");
    expect(problemText({ status: "FAILED", errorCode: "RESTARTED" })).toContain("перезапуском");
    expect(problemText({ status: "FAILED", errorCode: "WHATEVER" })).toBe("Сбой при работе ИИ");
  });

  it("счётчики на вкладках: у «Истории» числа нет", () => {
    const counts = { active: 1, review: 14, problems: 2 };
    expect(tabCount("review", counts)).toBe(14);
    expect(tabCount("history", counts)).toBeUndefined();
    expect(tabCount("active", undefined)).toBeUndefined();
  });

  it("у каждой вкладки есть слова для пустого списка", () => {
    expect(Object.keys(EMPTY_TEXT).sort()).toEqual(["active", "history", "problems", "review"]);
  });
});
