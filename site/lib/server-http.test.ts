import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getJson, NotFoundError, SSR_TIMEOUT_MS } from "./server-http";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SSR getJson timeout", () => {
  it("зависший бэкенд не держит страницу дольше SSR_TIMEOUT_MS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init?: RequestInit) =>
          new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
      )
    );
    const assertion = expect(getJson("/api/products", "uk")).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(SSR_TIMEOUT_MS);
    await assertion;
    expect(SSR_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it("быстрый ответ читается, 404 → NotFoundError, таймер снят", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await expect(getJson("/api/x", null)).resolves.toEqual({ ok: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(getJson("/api/x", null)).rejects.toBeInstanceOf(NotFoundError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
