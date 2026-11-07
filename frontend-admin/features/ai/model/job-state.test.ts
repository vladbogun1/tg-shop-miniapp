import { describe, expect, it } from "vitest";
import { canCancel, canRetry, elapsedClock, isActive, isDisappointing, isSlow, pollInterval, reviewState, reviewStateLabel, statusLabel, statusTone } from "./job-state";

describe("состояния задачи ИИ", () => {
  it("активны только QUEUED и RUNNING", () => {
    expect(isActive("QUEUED")).toBe(true);
    expect(isActive("RUNNING")).toBe(true);
    for (const s of ["DONE", "EMPTY", "BAD_ANSWER", "FAILED", "CANCELED"] as const) expect(isActive(s)).toBe(false);
  });

  it("у каждого статуса есть подпись и оттенок", () => {
    expect(statusLabel("DONE")).toBe("Готово");
    expect(statusTone("FAILED")).toBe("danger");
    expect(statusTone("RUNNING")).toBe("accent");
  });

  it("остановить можно идущую задачу, пока остановка не запрошена", () => {
    expect(canCancel({ status: "RUNNING", cancelRequested: false })).toBe(true);
    expect(canCancel({ status: "RUNNING", cancelRequested: true })).toBe(false);
    expect(canCancel({ status: "DONE", cancelRequested: false })).toBe(false);
  });

  it("повторить можно после неудачи и остановки, но не во время работы и не после успеха", () => {
    expect(canRetry({ status: "EMPTY" })).toBe(true);
    expect(canRetry({ status: "BAD_ANSWER" })).toBe(true);
    expect(canRetry({ status: "FAILED" })).toBe(true);
    expect(canRetry({ status: "CANCELED" })).toBe(true);
    expect(canRetry({ status: "RUNNING" })).toBe(false);
    expect(canRetry({ status: "DONE" })).toBe(false);
    expect(isDisappointing("DONE")).toBe(false);
  });

  it("опрос: 4 с при видимой вкладке, минута в фоне, у законченной выключен", () => {
    expect(pollInterval({ status: "QUEUED" })).toBe(4000);
    expect(pollInterval({ status: "RUNNING" }, true)).toBe(4000);
    expect(pollInterval({ status: "RUNNING" }, false)).toBe(60_000);
    expect(pollInterval({ status: "DONE" })).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
  });

  it("статусы глазами админа", () => {
    expect(reviewState({ status: "RUNNING", outcome: "" })).toBe("running");
    expect(reviewState({ status: "DONE", outcome: "" })).toBe("review");
    expect(reviewState({ status: "DONE", outcome: "PARTIAL" })).toBe("applied");
    expect(reviewState({ status: "DONE", outcome: "REJECTED" })).toBe("rejected");
    expect(reviewState({ status: "EMPTY", outcome: "" })).toBe("nodata");
    expect(reviewState({ status: "BAD_ANSWER", outcome: "" })).toBe("failed");
    expect(reviewState({ status: "CANCELED", outcome: "" })).toBe("canceled");
    expect(reviewStateLabel("nodata")).toBe("Не нашёл данных");
  });

  it("дольше обычного — после трёх минут; таймер минуты:секунды", () => {
    const now = Date.parse("2026-11-07T10:05:00Z");
    expect(isSlow("2026-11-07T10:01:00Z", now)).toBe(true);
    expect(isSlow("2026-11-07T10:03:00Z", now)).toBe(false);
    expect(elapsedClock("2026-11-07T10:03:55Z", now)).toBe("1:05");
    expect(elapsedClock(null, now)).toBe("0:00");
  });
});
