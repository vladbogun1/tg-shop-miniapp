import { describe, expect, it } from "vitest";
import { ApiError } from "@shop/core/errors";
import { describeFailure } from "./use-place-order";

const t = (key: string, p?: Record<string, string | number>) => `${key}:${p?.message ?? ""}`;

describe("describeFailure", () => {
  it("PROMO_REJECTED: промокод снимается, текст про это", () => {
    const r = describeFailure(new ApiError("used up", 400, "PROMO_REJECTED"), t);
    expect(r).toEqual({ dropPromo: true, message: "checkout.promoDropped:used up", limitCode: null, field: null });
  });
  it("лимит антиспама: текст сервера и код", () => {
    const r = describeFailure(new ApiError("pay first", 429, "TOO_MANY_UNPAID"), t);
    expect(r).toMatchObject({ dropPromo: false, message: "pay first", limitCode: "TOO_MANY_UNPAID" });
  });
  it("прочий отказ сервера: его текст; неизвестная ошибка: общий текст", () => {
    expect(describeFailure(new ApiError("boom", 500, "X"), t).message).toBe("boom");
    expect(describeFailure(new Error("net"), t).message).toBe("checkout.failed:");
  });
  it("puts a rejected customerName on its field and hides the server text", () => {
    const r = describeFailure(new ApiError("customerName: must not be blank", 400), t);
    expect(r.field).toBe("name");
    expect(r.message).toBe("checkout.fieldInvalid:");
  });
  it("shows a generic error for a validation failure of an unknown field", () => {
    const r = describeFailure(new ApiError("items: must not be empty", 400), t);
    expect(r.field).toBeNull();
    expect(r.message).toBe("checkout.failed:");
  });
});
