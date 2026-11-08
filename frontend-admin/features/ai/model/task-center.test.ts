import { describe, expect, it } from "vitest";
import type { AiJob, AiTaskRow } from "../api";
import { defaultTab, EMPTY_HINT, EMPTY_TEXT, isStale, problemText, reviewHref, tabCount, taskRowView, taskTitle } from "./task-center";

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

  it("задачи поставки решаются в поставке: без ревью карточки, со ссылкой на черновик", () => {
    const card = { feature: "CARD" as const, subjectType: "SUPPLY_DRAFT", subjectId: "d12-c-L3" };
    expect(reviewHref(job(card))).toBeNull();
    const waiting = taskRowView(row(card, "Черновик поставки №12 · Грипсы · карточка «Грипсы X»"), NOW);
    expect(waiting.title).toBe("Черновик поставки №12 · Грипсы · карточка «Грипсы X»");
    expect(waiting.stateLabel).toBe("Ждёт решения в поставке");
    expect(waiting.tone).not.toBe("accent");
    expect(waiting.open).toEqual({ href: "/preorders/drafts/12", label: "Открыть черновик" });
    expect(taskRowView(row({ ...card, outcome: "REJECTED" }), NOW).open).toBeNull();
    const manual = taskRowView(row({ feature: "SUPPLY_MATCH", subjectType: "SUPPLY_FILES", subjectId: "mabc" }), NOW);
    expect(manual.stateLabel).toBe("Ждёт решения в поставке");
    expect(manual.open).toBeNull();
    expect(taskRowView(row(), NOW).open).toEqual({ href: "/cards/ai-review/5", label: "Открыть проверку" });
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

  it("у каждой вкладки есть слова для пустого списка; «Идут» — как в макете 09", () => {
    expect(Object.keys(EMPTY_TEXT).sort()).toEqual(["active", "history", "problems", "review"]);
    expect(EMPTY_TEXT.active).toBe("Задач пока нет");
    expect(EMPTY_HINT.active).toBe("Запустите «Заполнить с ИИ» в карточке товара.");
  });

  it("при входе — «Проверить», если там что-то есть, иначе «Идут»", () => {
    expect(defaultTab(3)).toBe("review");
    expect(defaultTab(0)).toBe("active");
    expect(defaultTab(undefined)).toBe("active");
  });

  it("идущая задача показывает шаг вместо времени", () => {
    expect(taskRowView(row({ status: "RUNNING", finishedAt: undefined, step: "Ищу: viper" }), NOW).stepText).toBe("шаг «Ищу в интернете»");
    expect(taskRowView(row({ status: "QUEUED", finishedAt: undefined }), NOW).stepText).toBe("в очереди");
    expect(taskRowView(row(), NOW).stepText).toBeNull();
  });
});
