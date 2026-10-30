import { describe, expect, it } from "vitest";
import { answerConfirm, getPendingConfirm, requestConfirm } from "./confirm-store";

describe("confirm-store", () => {
  it("промис получает ответ человека", async () => {
    const p = requestConfirm({ title: "Удалить?" });
    expect(getPendingConfirm()?.options.title).toBe("Удалить?");
    answerConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(getPendingConfirm()).toBeNull();
  });

  it("второй вопрос отвечает «нет» первому", async () => {
    const first = requestConfirm({ title: "1" });
    const second = requestConfirm({ title: "2" });
    await expect(first).resolves.toBe(false);
    answerConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  it("ответ без вопроса ничего не делает", () => {
    expect(() => answerConfirm(true)).not.toThrow();
  });
});
