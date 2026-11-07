import { describe, expect, it } from "vitest";
import { hasUnsavedReply, replyValue } from "./drafts";
import type { AdminReview } from "./types";

const r = (adminReply: string | null) => ({ id: 7, adminReply }) as AdminReview;

describe("reply drafts", () => {
  it("replyValue: черновик главнее сохранённого ответа", () => {
    expect(replyValue(r("старый"), {})).toBe("старый");
    expect(replyValue(r("старый"), { 7: "новый" })).toBe("новый");
    expect(replyValue(r(null), {})).toBe("");
  });
  it("hasUnsavedReply: пробелы и совпадение с сохранённым не считаются", () => {
    expect(hasUnsavedReply(r("a"), {})).toBe(false);
    expect(hasUnsavedReply(r("a"), { 7: " a " })).toBe(false);
    expect(hasUnsavedReply(r("a"), { 7: "b" })).toBe(true);
    expect(hasUnsavedReply(r(null), { 7: "" })).toBe(false);
  });
});
