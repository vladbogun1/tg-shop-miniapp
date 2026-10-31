import { ApiError } from "@shop/core/errors";
import type { CreateOrderResult } from "@shop/core/types";
import { buildMutationOptions, newGuard } from "@shop/ui/mutation/api-mutation";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createCheckoutApi, type CreateOrderRequest } from "./api";
import { buildCreateOrderRequest, classifyOrderFailure, isValidCustomerName } from "./order-request";
import { isAuthFailure } from "./promo";
import { createOrderMutation } from "./use-create-order";

const result: CreateOrderResult = { orderId: "o1", amountDueMinor: 100 } as CreateOrderResult;
const base = {
  lines: [{ productId: "p1", variantId: null, quantity: 2 }],
  name: "  Тест Тестович ",
  phone: "0501234567",
  comment: "  ",
  promoCode: undefined,
  delivery: "NOVA_POSHTA" as const,
  warehouse: { ref: "w1", description: "Відділення №1", cityRef: "c1", cityName: "Харків" },
  paymentOptionId: "pay1",
  giftChoice: undefined,
};

describe("buildCreateOrderRequest", () => {
  it("Нова пошта: город и отделение из выбранного отделения, имя и комментарий без пробелов, телефон E.164", () => {
    const r = buildCreateOrderRequest(base);
    expect(r).toMatchObject({
      customerName: "Тест Тестович",
      phone: "+380501234567",
      comment: undefined,
      deliveryMethod: "NOVA_POSHTA",
      npCityRef: "c1",
      npCityName: "Харків",
      npWarehouseRef: "w1",
      npWarehouseName: "Відділення №1",
      paymentOptionId: "pay1",
    });
    expect(r.items).toEqual([{ productId: "p1", variantId: undefined, quantity: 2 }]);
  });

  it("самовывоз: НП-поля не отправляются, даже если отделение выбрано раньше", () => {
    const r = buildCreateOrderRequest({ ...base, delivery: "PICKUP", comment: " позвоните " });
    expect(r.comment).toBe("позвоните");
    expect([r.npCityRef, r.npCityName, r.npWarehouseRef, r.npWarehouseName]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("промокод и подарок передаются как есть", () => {
    const r = buildCreateOrderRequest({ ...base, promoCode: "OK10", giftChoice: "DISCOUNT" });
    expect([r.promoCode, r.giftChoice]).toEqual(["OK10", "DISCOUNT"]);
  });
});

describe("проверки и разбор отказа", () => {
  it("имя — от двух символов без пробелов по краям", () => {
    expect(isValidCustomerName(" а ")).toBe(false);
    expect(isValidCustomerName("Ан")).toBe(true);
  });

  it("PROMO_REJECTED, лимиты антиспама, прочее", () => {
    expect(classifyOrderFailure(new ApiError("занят", 400, "PROMO_REJECTED"))).toEqual({ kind: "promoRejected", message: "занят" });
    expect(classifyOrderFailure(new ApiError("есть неоплаченные", 409, "TOO_MANY_UNPAID"))).toEqual({
      kind: "limit",
      code: "TOO_MANY_UNPAID",
      message: "есть неоплаченные",
    });
    expect(classifyOrderFailure(new ApiError("сбой", 503))).toEqual({ kind: "other", message: "сбой" });
    expect(classifyOrderFailure(new Error("net"))).toEqual({ kind: "other", message: null });
  });

  it("401/403 — отказ входа (промокод падает на публичный просмотр)", () => {
    expect(isAuthFailure(new ApiError("x", 401))).toBe(true);
    expect(isAuthFailure(new ApiError("x", 403))).toBe(true);
    expect(isAuthFailure(new ApiError("x", 400))).toBe(false);
    expect(isAuthFailure(new Error("x"))).toBe(false);
  });
});

describe("createCheckoutApi", () => {
  function http() {
    return { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), del: vi.fn(async () => undefined) };
  }

  it("пути и параметры", async () => {
    const h = http();
    const api = createCheckoutApi(h as never);
    await api.previewPromo("A B", 1000, "p*1");
    await api.reservePromo("AB", 1000);
    await api.releasePromo("AB");
    await api.npWarehouses("c1");
    await api.npWarehousesBbox({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4, q: "x" });
    expect(h.get.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "/api/promo-codes/preview?code=A%20B&subtotalMinor=1000&items=p*1",
      "/api/np/warehouses?cityRef=c1&q=",
      "/api/np/warehouses/bbox?minLat=1&maxLat=2&minLng=3&maxLng=4&category=all&limit=1200&q=x",
    ].map((u) => u.replace("p*1", encodeURIComponent("p*1"))));
    expect((h.post.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("/api/me/promo/reserve?code=AB&subtotalMinor=1000");
    expect((h.del.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("/api/me/promo/reserve?code=AB");
  });

  it("закрытые вызовы идут через authed, публичные — нет; заказ несёт Idempotency-Key", async () => {
    const h = http();
    const authed = vi.fn(<T,>(call: () => Promise<T>) => call());
    const api = createCheckoutApi(h as never, authed as never);
    await api.previewPromo("A", 1);
    await api.npCities("x");
    await api.orderLimits();
    await api.paymentOptions();
    expect(authed).not.toHaveBeenCalled();
    await api.reservePromo("A", 1);
    await api.releasePromo("A");
    await api.createOrder({} as CreateOrderRequest, "key-1");
    expect(authed).toHaveBeenCalledTimes(3);
    expect(h.post).toHaveBeenLastCalledWith("/api/orders", {}, { "Idempotency-Key": "key-1" });
  });
});

describe("создание заказа: ключ идемпотентности", () => {
  function place(createOrder: ReturnType<typeof vi.fn>, before?: () => Promise<void>) {
    const qc = new QueryClient();
    const guard = newGuard();
    const obs = new MutationObserver<CreateOrderResult, unknown, CreateOrderRequest, unknown>(
      qc,
      buildMutationOptions(qc, createOrderMutation({ createOrder }, before), guard) as never,
    );
    return () => obs.mutate({} as CreateOrderRequest).catch(() => undefined);
  }
  const keys = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c[1] as string);

  it("сбой сервера (5xx) и обрыв связи — повтор с тем же ключом; после успеха — новый", async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("503", 503))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(result);
    const go = place(createOrder);
    await go();
    await go();
    await go();
    await go();
    const [a, b, c, d] = keys(createOrder);
    expect(a).toBeTruthy();
    expect([b, c]).toEqual([a, a]);
    expect(d).not.toBe(a);
  });

  it("отказ сервера (4xx) — следующая попытка с новым ключом (сервер помнит ключ только за созданным заказом)", async () => {
    const createOrder = vi.fn().mockRejectedValueOnce(new ApiError("лимит", 409, "TOO_MANY_UNPAID")).mockResolvedValueOnce(result);
    const go = place(createOrder);
    await go();
    await go();
    const [a, b] = keys(createOrder);
    expect(b).not.toBe(a);
  });

  it("перед отправкой дожидается beforePlace (запись корзины), и ошибки тоста нет", async () => {
    const order: string[] = [];
    const createOrder = vi.fn(async () => {
      order.push("order");
      return result;
    });
    await place(createOrder, async () => void order.push("flush"))();
    expect(order).toEqual(["flush", "order"]);
  });
});
