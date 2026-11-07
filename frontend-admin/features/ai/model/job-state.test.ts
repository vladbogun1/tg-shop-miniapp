import { describe, expect, it } from "vitest";
import { canCancel, canRetry, isActive, isDisappointing, pollInterval, statusLabel, statusTone } from "./job-state";

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

  it("опрос идёт только у активной задачи", () => {
    expect(pollInterval({ status: "QUEUED" })).toBe(2000);
    expect(pollInterval({ status: "DONE" })).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
  });
});
