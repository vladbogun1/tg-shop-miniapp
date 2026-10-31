import { describe, expect, it, vi } from "vitest";
import { createOrderApi, noAuthRetry } from "./api";
import { orderKeys } from "./keys";
import { stampOf, timelineSteps } from "./timeline";

function fakeHttp() {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    upload: vi.fn().mockResolvedValue({ url: "u" }),
  };
}

describe("createOrderApi", () => {
  it("оплата: returnTo берётся из политики приложения, display только для IFRAME", async () => {
    const http = fakeHttp();
    const mini = createOrderApi(http, noAuthRetry, { returnTo: "MINIAPP" });
    await mini.startPayment("o1", "uk");
    await mini.startPayment("o1", "uk", "IFRAME");
    await mini.startPayment("o1", "uk", "PAGE");
    expect(http.post.mock.calls).toEqual([
      ["/api/me/orders/o1/payment", { returnTo: "MINIAPP", locale: "uk" }],
      ["/api/me/orders/o1/payment", { returnTo: "MINIAPP", locale: "uk", display: "IFRAME" }],
      ["/api/me/orders/o1/payment", { returnTo: "MINIAPP", locale: "uk" }],
    ]);
  });

  it("история: before только если задан; все закрытые вызовы идут через authed", async () => {
    const http = fakeHttp();
    let calls = 0;
    const authed = <T>(call: () => Promise<T>) => {
      calls++;
      return call();
    };
    const api = createOrderApi(http, authed, { returnTo: "SITE" });
    await api.messages("o1");
    await api.messages("o1", 42);
    await api.receipts("o1");
    await api.requestCancel("o1", "why");
    expect(http.get.mock.calls.map((c) => c[0])).toEqual([
      "/api/me/orders/o1/messages",
      "/api/me/orders/o1/messages?before=42",
      "/api/me/orders/o1/receipts",
    ]);
    expect(http.post).toHaveBeenCalledWith("/api/me/orders/o1/cancel-request", { reason: "why" });
    expect(calls).toBe(4);
  });
});

describe("orderKeys", () => {
  it("значения ключей не менялись", () => {
    expect(orderKeys.list()).toEqual(["me", "orders"]);
    expect(orderKeys.detail("o1")).toEqual(["me", "orders", "o1"]);
    expect(orderKeys.detail("o1", "uk")).toEqual(["me", "orders", "o1", "uk"]);
    expect(orderKeys.messages("o1")).toEqual(["me", "orders", "o1", "messages"]);
    expect(orderKeys.receipts("o1")).toEqual(["me", "orders", "o1", "receipts"]);
  });
});

describe("timelineSteps", () => {
  it("отклонённый — шагов нет", () => {
    expect(timelineSteps({ status: "REJECTED" })).toBeNull();
  });
  it("SHIPPED: три пройдены, текущий третий, линия закрашена до него", () => {
    const steps = timelineSteps({ status: "SHIPPED", createdAt: "c", approvedAt: "a", shippedAt: "s" })!;
    expect(steps.map((s) => [s.status, s.done, s.current, s.linkDone, s.last])).toEqual([
      ["NEW", true, false, true, false],
      ["APPROVED", true, false, true, false],
      ["SHIPPED", true, true, false, false],
      ["DELIVERED", false, false, false, true],
    ]);
    expect(steps.map((s) => s.stamp)).toEqual(["c", "a", "s", undefined]);
  });
  it("stampOf: неизвестный статус без времени", () => {
    expect(stampOf({ status: "NEW", createdAt: "c" }, "REJECTED")).toBeNull();
  });
});
