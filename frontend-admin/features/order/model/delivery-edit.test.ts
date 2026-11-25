import { describe, expect, it } from "vitest";
import { canSwitchToNp, onlyPickupSwitch, buildDeliveryPatch, draftOf, isDeliveryInvalid, phoneDigits, placeOf, recipientMissing, serviceOf } from "./delivery-edit";

const order = {
  customerName: "Иван",
  phone: "+380501112233",
  deliveryMethod: "NOVA_POSHTA",
  npCityRef: "c1",
  npCityName: "Харьков",
  npWarehouseRef: "w1",
  npWarehouseName: "Отделение 1",
  recipientLastName: "Иванов",
  recipientFirstName: "Иван",
} as Parameters<typeof buildDeliveryPatch>[0];
const draft = draftOf(order);

describe("buildDeliveryPatch", () => {
  it("ничего не менял — пустой патч", () => {
    expect(buildDeliveryPatch(order, draft)).toEqual({});
  });
  it("имя и телефон — с обрезкой пробелов", () => {
    expect(buildDeliveryPatch(order, { ...draft, name: " Пётр ", phone: " 0501112244 " })).toEqual({ customerName: "Пётр", phone: "0501112244" });
  });
  it("новое отделение — тип, город и отделение разом", () => {
    expect(buildDeliveryPatch(order, { ...draft, wh: { ref: "w2", name: "Отделение 2" } })).toEqual({
      npServiceType: "WAREHOUSE",
      npCityRef: "c1",
      npCityName: "Харьков",
      npWarehouseRef: "w2",
      npWarehouseName: "Отделение 2",
    });
  });
  it("курьер: улица из справочника, дом, квартира", () => {
    const d = { ...draft, service: "DOORS" as const, wh: null, street: { ref: "s1", name: "Сумская" }, building: " 10 ", flat: "5" };
    expect(buildDeliveryPatch(order, d)).toEqual({
      npServiceType: "DOORS",
      npCityRef: "c1",
      npCityName: "Харьков",
      npStreetRef: "s1",
      npStreetName: "Сумская",
      npBuilding: "10",
      npFlat: "5",
    });
  });
  it("улица вручную — без ref", () => {
    const d = { ...draft, service: "DOORS" as const, street: { ref: null, name: "Новая" }, building: "1" };
    expect(buildDeliveryPatch(order, d)).not.toHaveProperty("npStreetRef");
  });
  it("получатель для НП — все три части", () => {
    expect(buildDeliveryPatch(order, { ...draft, middle: "Петрович" })).toEqual({
      recipientLastName: "Иванов",
      recipientFirstName: "Иван",
      recipientMiddleName: "Петрович",
    });
  });
  it("самовывоз или не выбрано отделение — адрес не трогаем", () => {
    const pickup = { ...order, deliveryMethod: "PICKUP" } as typeof order;
    expect(buildDeliveryPatch(pickup, { ...draftOf(pickup), wh: { ref: "w2", name: "x" } })).toEqual({});
    expect(buildDeliveryPatch(order, { ...draft, wh: null })).toEqual({});
  });
});

describe("isDeliveryInvalid", () => {
  it("нужны имя, 10 цифр и (для НП) город с отделением", () => {
    expect(isDeliveryInvalid(order, draft)).toBe(false);
    expect(isDeliveryInvalid(order, { ...draft, name: "" })).toBe(true);
    expect(isDeliveryInvalid(order, { ...draft, phone: "050111" })).toBe(true);
    expect(isDeliveryInvalid(order, { ...draft, wh: null })).toBe(true);
    const pickup = { ...order, deliveryMethod: "PICKUP" } as typeof order;
    expect(isDeliveryInvalid(pickup, { ...draftOf(pickup), city: null, wh: null })).toBe(false);
  });
  it("курьеру нужны улица и дом", () => {
    const d = { ...draft, service: "DOORS" as const, street: { ref: null, name: "Сумская" }, building: "" };
    expect(isDeliveryInvalid(order, d)).toBe(true);
    expect(isDeliveryInvalid(order, { ...d, building: "10" })).toBe(false);
  });
  it("фамилию и имя для НП стереть нельзя", () => {
    expect(recipientMissing(order, { ...draft, last: "" })).toBe(true);
    expect(isDeliveryInvalid(order, { ...draft, last: "" })).toBe(true);
  });
});

describe("phoneDigits / placeOf / serviceOf", () => {
  it("считает только цифры", () => {
    expect(phoneDigits("+38 (050) 111-22-33")).toBe(12);
  });
  it("место — только если есть и ref, и имя", () => {
    expect(placeOf("a", "b")).toEqual({ ref: "a", name: "b" });
    expect(placeOf("a", null)).toBeNull();
  });
  it("тип доставки: неизвестный — отделение", () => {
    expect(serviceOf({ npServiceType: "DOORS" })).toBe("DOORS");
    expect(serviceOf({ npServiceType: null })).toBe("WAREHOUSE");
  });
});

describe("смена способа доставки", () => {
  it("НП → самовывоз: только флаг, без адреса", () => {
    expect(buildDeliveryPatch(order, { ...draft, method: "PICKUP" })).toEqual({ deliveryMethod: "PICKUP" });
    expect(isDeliveryInvalid(order, { ...draft, method: "PICKUP", city: null })).toBe(false);
  });
  it("доставленный заказ НП: пустой телефон не держит переключение на самовывоз", () => {
    const delivered = { ...order, status: "DELIVERED" } as typeof order;
    expect(isDeliveryInvalid(delivered, { ...draft, phone: "", method: "PICKUP" })).toBe(false);
    expect(isDeliveryInvalid(order, { ...draft, phone: "", method: "PICKUP" })).toBe(true);
  });
  it("самовывоз → НП: получатель и адрес целиком; без адреса нельзя", () => {
    const pickup = { ...order, deliveryMethod: "PICKUP", npCityRef: null, npCityName: null, npWarehouseRef: null, npWarehouseName: null } as typeof order;
    const d = { ...draftOf(pickup), method: "NOVA_POSHTA" as const };
    expect(isDeliveryInvalid(pickup, d)).toBe(true);
    const full = { ...d, city: { ref: "c2", name: "Київ" }, wh: { ref: "w7", name: "Відділення 7" } };
    expect(isDeliveryInvalid(pickup, full)).toBe(false);
    expect(buildDeliveryPatch(pickup, full)).toEqual({
      deliveryMethod: "NOVA_POSHTA",
      npServiceType: "WAREHOUSE",
      npCityRef: "c2",
      npCityName: "Київ",
      npWarehouseRef: "w7",
      npWarehouseName: "Відділення 7",
      recipientLastName: "Иванов",
      recipientFirstName: "Иван",
      recipientMiddleName: "",
    });
  });
  it("доставленный заказ НП — только переключение на самовывоз; на НП — только до отправки", () => {
    expect(onlyPickupSwitch({ status: "DELIVERED", deliveryMethod: "NOVA_POSHTA" })).toBe(true);
    expect(onlyPickupSwitch({ status: "DELIVERED", deliveryMethod: "PICKUP" })).toBe(false);
    expect(canSwitchToNp({ status: "APPROVED" })).toBe(true);
    expect(canSwitchToNp({ status: "SHIPPED" })).toBe(false);
  });
});
