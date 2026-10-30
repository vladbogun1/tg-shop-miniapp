import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, hasErrorCode } from "./errors";

describe("ApiError", () => {
  it("carries status, code and params", () => {
    const e = new ApiError("boom", 409, "PROMO_REJECTED", { n: 3 });
    expect(e).toBeInstanceOf(Error);
    expect([e.name, e.status, e.code, e.params]).toEqual(["ApiError", 409, "PROMO_REJECTED", { n: 3 }]);
  });
});

describe("errorMessage", () => {
  const t = (key: string, p?: Record<string, string | number>) => (key === "error.ORDER_COOLDOWN" ? `wait ${p?.min} min` : key);

  it("translates by code when the dictionary has error.<CODE>", () => {
    expect(errorMessage(new ApiError("server text", 429, "ORDER_COOLDOWN", { min: 5 }), t, "x")).toBe("wait 5 min");
  });

  it("falls back to the server text when there is no translation or no translator", () => {
    expect(errorMessage(new ApiError("server text", 400, "UNKNOWN"), t, "x")).toBe("server text");
    expect(errorMessage(new ApiError("server text", 400, "ORDER_COOLDOWN"))).toBe("server text");
  });

  it("never shows the raw message of a non-API error", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), t, "try later")).toBe("try later");
    expect(errorMessage("x")).toBe("");
  });

  it("empty server text gives the fallback", () => {
    expect(errorMessage(new ApiError("", 500), undefined, "fb")).toBe("fb");
  });
});

describe("hasErrorCode", () => {
  it("matches only an ApiError with one of the codes", () => {
    expect(hasErrorCode(new ApiError("m", 400, "BAD_CODE"), "BAD_CODE", "BAD_AMOUNT")).toBe(true);
    expect(hasErrorCode(new ApiError("m", 400), "BAD_CODE")).toBe(false);
    expect(hasErrorCode({ code: "BAD_CODE" }, "BAD_CODE")).toBe(false);
  });
});
