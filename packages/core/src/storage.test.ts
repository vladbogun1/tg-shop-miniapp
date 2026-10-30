import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorage } from "./storage";

function fakeArea(opts: { throwOnSet?: boolean } = {}) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new Error("quota");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}
const g = globalThis as unknown as { window?: unknown };

afterEach(() => {
  delete g.window;
});

describe("storage without a browser (SSR)", () => {
  it("reads null and writes false instead of throwing", () => {
    const s = createStorage("local");
    expect(s.getItem("a")).toBeNull();
    expect(s.setItem("a", "1")).toBe(false);
    expect(() => s.removeItem("a")).not.toThrow();
    expect(s.getJson("a")).toBeNull();
  });
});

describe("storage in a browser", () => {
  let local: ReturnType<typeof fakeArea>;
  beforeEach(() => {
    local = fakeArea();
    g.window = { localStorage: local, sessionStorage: fakeArea() };
  });

  it("round-trips strings and JSON; the prefix goes into the real key", () => {
    const s = createStorage("local", "shop:");
    expect(s.setItem("k", "v")).toBe(true);
    expect(local.raw.get("shop:k")).toBe("v");
    expect(s.getItem("k")).toBe("v");
    s.setJson("j", { a: 1 });
    expect(s.getJson<{ a: number }>("j")).toEqual({ a: 1 });
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });

  it("getJson: a corrupt value is null, not an exception", () => {
    const s = createStorage("local");
    s.setItem("bad", "{not json");
    expect(s.getJson("bad")).toBeNull();
  });

  it("local and session are separate areas", () => {
    createStorage("session").setItem("x", "1");
    expect(createStorage("local").getItem("x")).toBeNull();
  });

  it("a failing write (quota, private mode) returns false", () => {
    g.window = { localStorage: fakeArea({ throwOnSet: true }) };
    expect(createStorage("local").setItem("k", "v")).toBe(false);
  });

  it("an inaccessible storage (the getter throws) behaves like no storage", () => {
    g.window = {
      get localStorage(): never {
        throw new Error("SecurityError");
      },
    };
    const s = createStorage("local");
    expect(s.getItem("k")).toBeNull();
    expect(s.setItem("k", "v")).toBe(false);
  });
});
