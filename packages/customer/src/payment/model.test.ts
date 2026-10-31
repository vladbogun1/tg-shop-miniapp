import { ApiError } from "@shop/core/errors";
import type { OrderDetail } from "@shop/core/types";
import { describe, expect, it } from "vitest";
import { awaitingOnline, IN_FLIGHT, paymentStartFailure, pendingPayment } from "./model";

function order(over: { payment?: Record<string, unknown> } = {}): OrderDetail {
  const { payment, ...rest } = over;
  return {
    paid: false,
    status: "NEW",
    amountDueMinor: 1000,
    paymentDueAt: "2026-11-01T00:00:00Z",
    totalMinor: 1000,
    receivedMinor: 0,
    payment: { enabled: true, status: "none", ...payment },
    ...rest,
  } as unknown as OrderDetail;
}

describe("payment model", () => {
  it("«в полёте» — только processing и hold", () => {
    expect([...IN_FLIGHT]).toEqual(["processing", "hold"]);
  });

  it("ждёт онлайн-оплаты, пока она включена; в пути — пока счёт created/processing/hold", () => {
    expect(awaitingOnline(order({}))).toBe(true);
    expect(awaitingOnline(order({ payment: { enabled: false } }))).toBe(false);
    expect(pendingPayment(order({ payment: { status: "created" } }))).toBe(true);
    expect(pendingPayment(order({ payment: { status: "hold" } }))).toBe(true);
    expect(pendingPayment(order({ payment: { status: "failure" } }))).toBe(false);
    expect(pendingPayment(order({ payment: { status: "none" } }))).toBe(false);
  });

  it("отказ начала оплаты: код и текст сервера, а для чужой ошибки — пусто", () => {
    expect(paymentStartFailure(new ApiError("в процессе", 409, "PAYMENT_IN_PROGRESS"))).toEqual({ code: "PAYMENT_IN_PROGRESS", message: "в процессе" });
    expect(paymentStartFailure(new TypeError("x"))).toEqual({ code: undefined, message: null });
  });
});
