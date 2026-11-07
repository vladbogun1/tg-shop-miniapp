import { describe, expect, it } from "vitest";
import { CANCEL_REASON_MAX, cancelBody, cancelReasonTooLong } from "./cancel";

describe("cancelBody", () => {
  it("пустая или из пробелов причина уходит как null", () => {
    expect(cancelBody({ closeQueue: true, reason: "   " })).toEqual({ closeQueue: true, reason: null });
  });

  it("причина обрезается по краям", () => {
    expect(cancelBody({ closeQueue: false, reason: "  завод закрылся " })).toEqual({ closeQueue: false, reason: "завод закрылся" });
  });
});

describe("cancelReasonTooLong", () => {
  it("500 знаков можно, 501 нельзя; пробелы по краям не считаются", () => {
    expect(cancelReasonTooLong(" " + "я".repeat(CANCEL_REASON_MAX) + " ")).toBe(false);
    expect(cancelReasonTooLong("я".repeat(CANCEL_REASON_MAX + 1))).toBe(true);
  });
});
