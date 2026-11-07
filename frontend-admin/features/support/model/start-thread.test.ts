import { describe, expect, it } from "vitest";
import { manualIdProblem, openThreadOf, parseStartThread } from "./start-thread";

describe("parseStartThread", () => {
  it("builds the body, trimming and dropping an empty subject", () => {
    expect(parseStartThread(" 42 ", "  ", " Привіт ")).toEqual({ userId: 42, subject: undefined, text: "Привіт" });
    expect(parseStartThread("42", " Приз ", "x")?.subject).toBe("Приз");
  });

  it("refuses a bad id or an empty message", () => {
    expect(parseStartThread("abc", "", "x")).toBeNull();
    expect(parseStartThread("", "", "x")).toBeNull();
    expect(parseStartThread("42", "", "  ")).toBeNull();
  });
});

describe("manualIdProblem / openThreadOf", () => {
  it("пустой id — не ошибка, мусор — ошибка", () => {
    expect(manualIdProblem("")).toBeNull();
    expect(manualIdProblem(" 42 ")).toBeNull();
    expect(manualIdProblem("@ivan")).not.toBeNull();
    expect(manualIdProblem("0")).not.toBeNull();
  });

  it("дубль: находит только открытый вопрос того же клиента", () => {
    const list = [
      { id: "a", userId: 1, status: "CLOSED" },
      { id: "b", userId: 2, status: "OPEN" },
      { id: "c", userId: 1, status: "OPEN" },
    ];
    expect(openThreadOf(list, 1)?.id).toBe("c");
    expect(openThreadOf(list, 3)).toBeUndefined();
    expect(openThreadOf(list, null)).toBeUndefined();
  });
});
