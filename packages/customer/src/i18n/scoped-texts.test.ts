import { describe, expect, it } from "vitest";
import { ORDER_DELIVERY_TEXTS } from "./order-delivery";
import { withScopedTexts } from "./scoped-texts";

describe("словарь своих экранов", () => {
  const appT = (key: string) => `app:${key}`;

  it("свой ключ — из своего словаря на языке, с параметрами; чужой — обычным t", () => {
    const t = withScopedTexts(appT, "uk", ORDER_DELIVERY_TEXTS);
    expect(t("parcel.cod", { amount: "100 ₴" })).toBe("До сплати під час отримання: 100 ₴");
    expect(t("parcel.title")).toBe("Посилка");
    expect(t("common.back")).toBe("app:common.back");
  });

  it("язык берётся из locale", () => {
    expect(withScopedTexts(appT, "en", ORDER_DELIVERY_TEXTS)("parcel.track")).toBe("Track");
  });
});
