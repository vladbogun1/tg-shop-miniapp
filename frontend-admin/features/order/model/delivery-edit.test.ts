import { describe, expect, it } from "vitest";
import { buildDeliveryPatch, isDeliveryInvalid, phoneDigits, placeOf } from "./delivery-edit";

const order = {
  customerName: "Иван",
  phone: "+380501112233",
  deliveryMethod: "NOVA_POSHTA",
  npCityRef: "c1",
  npCityName: "Харьков",
  npWarehouseRef: "w1",
  npWarehouseName: "Отделение 1",
} as Parameters<typeof buildDeliveryPatch>[0];
const city = { ref: "c1", name: "Харьков" };
const wh = { ref: "w1", name: "Отделение 1" };

describe("buildDeliveryPatch", () => {
  it("ничего не менял — пустой патч", () => {
    expect(buildDeliveryPatch(order, "Иван", "+380501112233", city, wh)).toEqual({});
  });
  it("имя и телефон — с обрезкой пробелов", () => {
    expect(buildDeliveryPatch(order, " Пётр ", " 0501112244 ", city, wh)).toEqual({ customerName: "Пётр", phone: "0501112244" });
  });
  it("новое отделение — весь адрес разом", () => {
    expect(buildDeliveryPatch(order, "Иван", order.phone, city, { ref: "w2", name: "Отделение 2" })).toEqual({
      npCityRef: "c1",
      npCityName: "Харьков",
      npWarehouseRef: "w2",
      npWarehouseName: "Отделение 2",
    });
  });
  it("самовывоз или не выбрано отделение — адрес не трогаем", () => {
    expect(buildDeliveryPatch({ ...order, deliveryMethod: "PICKUP" }, "Иван", order.phone, city, { ref: "w2", name: "x" })).toEqual({});
    expect(buildDeliveryPatch(order, "Иван", order.phone, city, null)).toEqual({});
  });
});

describe("isDeliveryInvalid / phoneDigits / placeOf", () => {
  it("нужны имя, 10 цифр и (для НП) город с отделением", () => {
    expect(isDeliveryInvalid(true, "Иван", "0501112233", city, wh)).toBe(false);
    expect(isDeliveryInvalid(true, "", "0501112233", city, wh)).toBe(true);
    expect(isDeliveryInvalid(false, "Иван", "050111", null, null)).toBe(true);
    expect(isDeliveryInvalid(true, "Иван", "0501112233", city, null)).toBe(true);
    expect(isDeliveryInvalid(false, "Иван", "0501112233", null, null)).toBe(false);
  });
  it("считает только цифры", () => {
    expect(phoneDigits("+38 (050) 111-22-33")).toBe(12);
  });
  it("место — только если есть и ref, и имя", () => {
    expect(placeOf("a", "b")).toEqual({ ref: "a", name: "b" });
    expect(placeOf("a", null)).toBeNull();
  });
});
