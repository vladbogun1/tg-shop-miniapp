import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_TIMEOUT_MS, createHttpClient, REQUEST_TIMEOUT_MS } from "./http";

/** fetch, который не отвечает никогда и реагирует только на abort — как зависший бэкенд. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new DOMException("aborted", "AbortError"));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })
  );
}

const client = () => createHttpClient({ baseUrl: "http://x", getToken: () => null, messages: { offline: () => "OFFLINE" } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("http timeout", () => {
  it("зависший GET через 15 с даёт тот же ApiError(status 0), что и обрыв сети", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const p = client().get("/api/x");
    const assertion = expect(p).rejects.toMatchObject({ name: "ApiError", status: 0, message: "OFFLINE" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("до таймаута запрос ещё ждёт", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    client().get("/api/x").catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("заказ (Idempotency-Key) ждёт дольше обычного POST и не повторяется", async () => {
    const f = hangingFetch();
    vi.stubGlobal("fetch", f);
    let order = false;
    let plain = false;
    client().post("/api/orders", {}, { "Idempotency-Key": "k" }).catch(() => (order = true));
    client().post("/api/other", {}).catch(() => (plain = true));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect([order, plain]).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(CHECKOUT_TIMEOUT_MS - REQUEST_TIMEOUT_MS);
    expect(order).toBe(true);
    expect(f).toHaveBeenCalledTimes(2); // ни одного повтора
  });

  it("тело ответа, которое зависло на полпути, тоже обрывается", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            new Promise<string>((_r, reject) =>
              init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
            ),
        } as unknown as Response)
      )
    );
    const assertion = expect(client().get("/api/x")).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("быстрый ответ работает и таймер снимается", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })));
    await expect(client().get("/api/x")).resolves.toEqual({ a: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("HTTP-ошибка сервера остаётся ApiError со своим статусом", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "X", message: "m" }), { status: 409 })));
    await expect(client().get("/api/x")).rejects.toMatchObject({ status: 409, code: "X" });
  });
});

describe("http: signal вызывающего", () => {
  it("отмена вызывающим обрывает запрос сразу и снимает таймер", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    const { fetchWithTimeout } = await import("./fetch-timeout");
    const p = fetchWithTimeout("http://x/y", { signal: ac.signal }, 15_000);
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    ac.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("уже отменённый signal не даёт отправить запрос", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { fetchWithTimeout } = await import("./fetch-timeout");
    const ac = new AbortController();
    ac.abort();
    await expect(fetchWithTimeout("http://x/y", { signal: ac.signal }, 1000)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("таймаут отличим от отмены: FetchTimeoutError", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { fetchWithTimeout, FetchTimeoutError } = await import("./fetch-timeout");
    const p = fetchWithTimeout("http://x/y", { signal: new AbortController().signal }, 500);
    const assertion = expect(p).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });
});

