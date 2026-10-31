import { describe, expect, it } from "vitest";
import { WRITEOFF_LABEL, leftOf } from "./writeoffs";

describe("writeoffs", () => {
  it("подписи причин", () => {
    expect(WRITEOFF_LABEL.DEFECT).toBe("Брак");
    expect(WRITEOFF_LABEL.SOLD_OFFLINE).toBe("Продано вне сайта");
  });
  it("leftOf учитывает возвращённое", () => {
    expect(leftOf({ quantity: 5, undoneQty: 2 })).toBe(3);
    expect(leftOf({ quantity: 5 })).toBe(5);
  });
});
