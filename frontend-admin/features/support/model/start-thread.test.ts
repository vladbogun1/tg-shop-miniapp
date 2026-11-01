import { describe, expect, it } from "vitest";
import { parseStartThread } from "./start-thread";

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
