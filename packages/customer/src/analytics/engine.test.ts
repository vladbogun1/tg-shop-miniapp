import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics, type AnalyticsPolicy } from "./engine";
import { addToCartEvent, checkoutStartEvent, compareEvent, orderCreatedEvent, productViewEvent } from "./events";

const miniPolicy = (token: string | null): AnalyticsPolicy => ({
  keys: { buffer: "t-buf", session: "t-sid" },
  maxBuffered: 3,
  request: () => (token ? { url: "/api/me/analytics", headers: { Authorization: `Bearer ${token}` } } : null),
  fallbackId: () => "fallback",
  unavailableId: "none",
});

const sitePolicy: AnalyticsPolicy = {
  keys: { buffer: "t-sbuf", session: "t-ssid", anon: "t-aid" },
  maxBuffered: 50,
  request: () => ({ url: "/api/public/analytics", headers: {}, credentials: "include" }),
  fallbackId: () => "fallback",
  unavailableId: "none",
};

describe("analytics engine", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Mini App: тело {sessionId, events}, Bearer, без anonId; без токена не шлёт и не теряет события", async () => {
    let token: string | null = null;
    const a = createAnalytics({ ...miniPolicy("x"), request: () => miniPolicy(token).request() });
    a.track("checkout_start");
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    token = "tok";
    await a.flush(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/me/analytics");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer tok" });
    expect(init.credentials).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(["sessionId", "events"]);
    expect(body.events[0].event).toBe("checkout_start");
  });

  it("сайт: тело {anonId, sessionId, events} и credentials include", async () => {
    const a = createAnalytics(sitePolicy);
    a.track("view");
    await a.flush();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/public/analytics");
    expect(init.credentials).toBe("include");
    expect(Object.keys(JSON.parse(init.body))).toEqual(["anonId", "sessionId", "events"]);
  });

  it("буфер ограничен политикой, 5xx возвращает события, 4xx отбрасывает", async () => {
    const a = createAnalytics(miniPolicy("tok"));
    for (let i = 0; i < 5; i++) a.track(`e${i}`);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await a.flush();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    await a.flush();
    await a.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events.map((e: { event: string }) => e.event)).toEqual(["e2", "e3", "e4"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).events).toHaveLength(3);
  });
});

describe("analytics events", () => {
  it("форма событий — контракт с бэкендом", () => {
    expect(productViewEvent("p1")).toEqual(["product_view", undefined, '{"productId":"p1"}']);
    expect(addToCartEvent("p1", null, 2)).toEqual(["add_to_cart", undefined, '{"productId":"p1","variantId":null,"qty":2}']);
    expect(compareEvent("compare_open", undefined, 3)).toEqual(["compare_open", undefined, '{"count":3}']);
    expect(orderCreatedEvent("o1")[2]).toBe('{"orderId":"o1"}');
    expect(checkoutStartEvent()).toEqual(["checkout_start", undefined, undefined]);
  });
});
