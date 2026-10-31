import { describe, expect, it } from "vitest";
import { parseOrderDeepLink, parseOrderViewDeepLink, parseProductDeepLink } from "./deeplinks";

describe("deeplinks", () => {
  it("order_/view_", () => {
    expect(parseOrderDeepLink("order_abc")).toBe("abc");
    expect(parseOrderDeepLink("view_abc")).toBeNull();
    expect(parseOrderViewDeepLink("view-abc")).toBe("abc");
    expect(parseOrderViewDeepLink(null)).toBeNull();
  });
  it("pp_ нормализует uuid", () => {
    expect(parseProductDeepLink("pp_0123456789ABCDEF0123456789abcdef")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    expect(parseProductDeepLink("pp_zzz")).toBeNull();
  });
});
