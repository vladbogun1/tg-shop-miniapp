import { describe, expect, it } from "vitest";
import { buildStatusPayload, cleanTtn, heldMoneyKind, isStatusInvalid, REASONS, ttnLooksWrong } from "./status-change";

const base = { hasOrder: true, needsTtn: false, ttnClean: "", needsReason: false, code: null, reason: "" } as const;

describe("isStatusInvalid", () => {
  it("без заказа нельзя", () => {
    expect(isStatusInvalid({ ...base, hasOrder: false })).toBe(true);
  });
  it("для отправки нужна ТТН", () => {
    expect(isStatusInvalid({ ...base, needsTtn: true })).toBe(true);
    expect(isStatusInvalid({ ...base, needsTtn: true, ttnClean: "20450000000000" })).toBe(false);
  });
  it("для отклонения нужна причина, для «Другое» ещё и текст", () => {
    expect(isStatusInvalid({ ...base, needsReason: true })).toBe(true);
    expect(isStatusInvalid({ ...base, needsReason: true, code: "OTHER", reason: " " })).toBe(true);
    expect(isStatusInvalid({ ...base, needsReason: true, code: "OTHER", reason: "x" })).toBe(false);
    expect(isStatusInvalid({ ...base, needsReason: true, code: "RETURNED" })).toBe(false);
  });
});

describe("ТТН и причины", () => {
  it("убирает пробелы", () => {
    expect(cleanTtn(" 2045 0000 \t0000 00")).toBe("20450000000000");
  });
  it("подсказка о формате только при вводе", () => {
    expect(ttnLooksWrong(true, "")).toBe(false);
    expect(ttnLooksWrong(true, "123")).toBe(true);
    expect(ttnLooksWrong(true, "20450000000000")).toBe(false);
    expect(ttnLooksWrong(false, "123")).toBe(false);
  });
  it("системные причины не предлагаются", () => {
    expect(REASONS).not.toContain("PAYMENT_TIMEOUT");
    expect(REASONS).not.toContain("MERGED");
  });
});

describe("buildStatusPayload", () => {
  const args = {
    ttnClean: "20450000000000",
    code: "RETURNED" as const,
    reason: " почему ",
    restock: true,
    inTransit: false,
    shippedReject: false,
  };
  it("отправка — только ТТН", () => {
    expect(buildStatusPayload({ ...args, target: "SHIPPED" })).toEqual({ status: "SHIPPED", trackingNumber: args.ttnClean });
  });
  it("отклонение — причина и склад", () => {
    expect(buildStatusPayload({ ...args, target: "REJECTED" })).toEqual({
      status: "REJECTED",
      rejectReasonCode: "RETURNED",
      rejectReason: "почему",
      restock: true,
    });
  });
  it("едет назад — склад не трогаем, метка возврата", () => {
    expect(buildStatusPayload({ ...args, target: "REJECTED", shippedReject: true, inTransit: true })).toEqual({
      status: "REJECTED",
      rejectReasonCode: "RETURNED",
      rejectReason: "почему",
      returnInTransit: true,
    });
  });
});

describe("heldMoneyKind", () => {
  it("предоплата удерживается, пока получено не больше неё", () => {
    expect(heldMoneyKind(100, 100)).toBe("held");
    expect(heldMoneyKind(150, 100)).toBe("over");
    expect(heldMoneyKind(50, 0)).toBe("over");
    expect(heldMoneyKind(50, undefined)).toBe("unknown");
  });
});
