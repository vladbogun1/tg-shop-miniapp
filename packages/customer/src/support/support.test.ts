import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./api";
import { parseSupportDeepLink, SUPPORT_KEYS } from "./model";

const pass = <T>(call: () => Promise<T>) => call();
const http = () => ({ get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}), upload: vi.fn() });

describe("createSupportApi", () => {
  it("Mini App: история без limit; сайт: с явным limit", async () => {
    const a = http();
    const b = http();
    await createSupportApi(a, pass).messages("t1");
    await createSupportApi(a, pass).messages("t1", 9);
    await createSupportApi(b, pass, { messagesLimit: 50 }).messages("t1");
    await createSupportApi(b, pass, { messagesLimit: 50 }).messages("t1", 9);
    expect(a.get.mock.calls.map((c) => c[0])).toEqual([
      "/api/me/support/threads/t1/messages",
      "/api/me/support/threads/t1/messages?before=9",
    ]);
    expect(b.get.mock.calls.map((c) => c[0])).toEqual([
      "/api/me/support/threads/t1/messages?limit=50",
      "/api/me/support/threads/t1/messages?limit=50&before=9",
    ]);
  });
});

describe("support model", () => {
  it("deep link и ключи", () => {
    expect(parseSupportDeepLink("support_abc")).toBe("abc");
    expect(parseSupportDeepLink("support-abc")).toBe("abc");
    expect(parseSupportDeepLink("order_1")).toBeNull();
    expect(parseSupportDeepLink(null)).toBeNull();
    expect(SUPPORT_KEYS.messages("t")).toEqual(["me", "support", "thread", "t", "messages"]);
  });
});
