import type { NpWarehouse } from "@shop/core/types";
import { describe, expect, it } from "vitest";
import { buildDeliveryFields, deliveryOk, draftFromOrder, findWarehouseByRef, type DeliveryDraft } from "./draft";
import { estimateAmounts, estimateKey, estimateRequestOf } from "./estimate";
import { courierOk, EMPTY_COURIER, fixLookalikes, recipientCustomerName, recipientErrors, recipientLine, recipientOk, recipientOfOrder, splitFullName } from "./recipient";
import { availabilityOf, availableTabs, keepsWarehouseOnTab, tabForWarehouse, tabOfOrder, warehouseFitsTab } from "./tabs";

const branch = { ref: "w1", description: "Відділення №1", cityRef: "c1", cityName: "Харків", category: "BRANCH" } as NpWarehouse;
const locker = { ref: "p1", description: "Поштомат №5", cityRef: "c1", cityName: "Харків", category: "POSTOMAT" } as NpWarehouse;
const recipient = { lastName: " Іваненко ", firstName: "Іван", middleName: " Петрович " };

const draft = (over: Partial<DeliveryDraft>): DeliveryDraft => ({
  tab: "WAREHOUSE",
  city: { ref: "c1", name: "Харків" },
  warehouse: branch,
  courier: EMPTY_COURIER,
  recipient,
  ...over,
});

describe("вкладки", () => {
  it("без конфига — все четыре; выключенные службы прячутся", () => {
    expect(availableTabs(availabilityOf(null))).toEqual(["WAREHOUSE", "POSTOMAT", "DOORS", "PICKUP"]);
    expect(availableTabs(availabilityOf({ postomatEnabled: false, courierEnabled: false, estimateEnabled: true }))).toEqual(["WAREHOUSE", "PICKUP"]);
  });

  it("поштомат подходит только «Поштомату», остальное — «Відділенню»", () => {
    expect(warehouseFitsTab(locker, "POSTOMAT")).toBe(true);
    expect(warehouseFitsTab(locker, "WAREHOUSE")).toBe(false);
    expect(warehouseFitsTab(branch, "WAREHOUSE")).toBe(true);
    expect(warehouseFitsTab(branch, "DOORS")).toBe(false);
  });

  it("точка переживает «Кур'єр»/«Самовивіз», сбрасывается только между відділенням и поштоматом", () => {
    expect(keepsWarehouseOnTab(branch, "DOORS")).toBe(true);
    expect(keepsWarehouseOnTab(branch, "PICKUP")).toBe(true);
    expect(keepsWarehouseOnTab(branch, "WAREHOUSE")).toBe(true);
    expect(keepsWarehouseOnTab(branch, "POSTOMAT")).toBe(false);
    expect(keepsWarehouseOnTab(locker, "WAREHOUSE")).toBe(false);
    expect(tabForWarehouse(locker)).toBe("POSTOMAT");
  });

  it("вкладка прошлого заказа; старые заказы без службы — відділення", () => {
    expect(tabOfOrder({ deliveryMethod: "PICKUP" })).toBe("PICKUP");
    expect(tabOfOrder({ deliveryMethod: "NOVA_POSHTA", npServiceType: "DOORS" })).toBe("DOORS");
    expect(tabOfOrder({ deliveryMethod: "NOVA_POSHTA" })).toBe("WAREHOUSE");
  });
});

describe("получатель и курьер", () => {
  it("прізвище и ім'я от двух букв, по батькові необязательно", () => {
    expect(recipientOk(recipient)).toBe(true);
    expect(recipientOk({ ...recipient, firstName: " І " })).toBe(false);
  });

  it("латиница: двойник в кириллическом слове — не ошибка (заказ #e6e83c17), слово латиницей — ошибка", () => {
    expect(fixLookalikes("Курзiн")).toBe("Курзін");
    expect(fixLookalikes("Мар'янa-Kатерина")).toBe("Мар'яна-Катерина");
    expect(recipientOk({ ...recipient, lastName: "Курзiн" })).toBe(true);
    const e = recipientErrors({ ...recipient, lastName: "Kurzin", middleName: "Petrovych" });
    expect(e.lastName && e.latin.lastName).toBe(true);
    expect(e.middleName).toBe(true);
    expect(recipientOk({ ...recipient, middleName: "Petrovych" })).toBe(false);
    expect(recipientOk({ lastName: "Smith", firstName: "John", middleName: "" }, true)).toBe(true);
  });

  it("customerName — «Прізвище Ім'я», строка сводки — все три части", () => {
    expect(recipientCustomerName(recipient)).toBe("Іваненко Іван");
    expect(recipientLine(recipient)).toBe("Іваненко Іван Петрович");
  });

  it("старое одно имя режется по пробелам; раздельные поля важнее", () => {
    expect(splitFullName("  Іваненко  Іван Петрович ")).toEqual({ lastName: "Іваненко", firstName: "Іван", middleName: "Петрович" });
    expect(recipientOfOrder({ customerName: "Х У", recipientLastName: "А", recipientFirstName: "Б" })).toEqual({ lastName: "А", firstName: "Б", middleName: "" });
  });

  it("курьеру нужны улица и дом, квартира необязательна", () => {
    expect(courierOk({ ...EMPTY_COURIER, streetName: "Сумська", building: "1" })).toBe(true);
    expect(courierOk({ ...EMPTY_COURIER, streetName: "Сумська" })).toBe(false);
  });
});

describe("черновик доставки", () => {
  it("точка не того типа не считается заполненной", () => {
    expect(deliveryOk(draft({}))).toBe(true);
    expect(deliveryOk(draft({ tab: "POSTOMAT" }))).toBe(false);
    expect(deliveryOk(draft({ tab: "POSTOMAT", warehouse: locker }))).toBe(true);
    expect(deliveryOk(draft({ tab: "PICKUP", warehouse: null }))).toBe(true);
  });

  it("курьер: город + адрес", () => {
    const courier = { streetRef: "s1", streetName: "Сумська", building: "10", flat: "" };
    expect(deliveryOk(draft({ tab: "DOORS", warehouse: null, courier }))).toBe(true);
    expect(deliveryOk(draft({ tab: "DOORS", city: null, warehouse: null, courier }))).toBe(false);
  });

  it("поля заказа: відділення", () => {
    expect(buildDeliveryFields(draft({}))).toMatchObject({
      customerName: "Іваненко Іван",
      deliveryMethod: "NOVA_POSHTA",
      npServiceType: "WAREHOUSE",
      npCityRef: "c1",
      npWarehouseRef: "w1",
      recipientLastName: "Іваненко",
      recipientMiddleName: "Петрович",
    });
  });

  it("поля заказа: курьер без точки, пустая квартира не отправляется", () => {
    const f = buildDeliveryFields(draft({ tab: "DOORS", warehouse: branch, courier: { streetRef: "", streetName: " Сумська ", building: "10", flat: " " } }));
    expect(f).toMatchObject({ npServiceType: "DOORS", npStreetName: "Сумська", npBuilding: "10", npCityRef: "c1" });
    expect([f.npWarehouseRef, f.npStreetRef, f.npFlat]).toEqual([undefined, undefined, undefined]);
  });

  it("поля заказа: самовывоз без НП", () => {
    const f = buildDeliveryFields(draft({ tab: "PICKUP" }));
    expect(f.deliveryMethod).toBe("PICKUP");
    expect([f.npCityRef, f.npWarehouseRef, f.npServiceType]).toEqual([undefined, undefined, undefined]);
  });

  it("прошлый заказ: курьер с адресом, отделение ищется по ref, потом по названию", () => {
    const d = draftFromOrder({ deliveryMethod: "NOVA_POSHTA", npServiceType: "DOORS", npCityRef: "c1", npCityName: "Харків", npStreetName: "Сумська", npBuilding: "10" });
    expect(d.tab).toBe("DOORS");
    expect(d.courier.streetName).toBe("Сумська");
    expect(findWarehouseByRef([branch, locker], "p1", null)).toBe(locker);
    expect(findWarehouseByRef([branch], "gone", "Відділення №1")).toBe(branch);
    expect(findWarehouseByRef([branch], "gone", "нет")).toBeNull();
  });
});

describe("подсказка цены", () => {
  const lines = [{ productId: "p", variantId: null, quantity: 1 }];

  it("нет запроса для самовывоза, без города и с пустой корзиной", () => {
    expect(estimateRequestOf(draft({ tab: "PICKUP" }), lines, 100, 0)).toBeNull();
    expect(estimateRequestOf(draft({ tab: "DOORS", city: null }), lines, 100, 0)).toBeNull();
    expect(estimateRequestOf(draft({}), [], 100, 0)).toBeNull();
  });

  it("ключ не зависит от порядка строк", () => {
    const a = estimateRequestOf(draft({}), [lines[0]!, { productId: "q", quantity: 2 }], 100, 50)!;
    const b = estimateRequestOf(draft({}), [{ productId: "q", quantity: 2 }, lines[0]!], 100, 50)!;
    expect(estimateKey(a)).toBe(estimateKey(b));
    expect(a.serviceType).toBe("WAREHOUSE");
  });

  it("одна цифра; «недоступно» и ноль — без подсказки", () => {
    expect(estimateAmounts({ available: true, deliveryMinor: 9000, codFeeMinor: 2200 })).toEqual({ deliveryMinor: 9000, withCodFee: true });
    expect(estimateAmounts({ available: true, deliveryMinor: 9000, codFeeMinor: 0 })).toEqual({ deliveryMinor: 9000, withCodFee: false });
    expect(estimateAmounts({ available: false, deliveryMinor: 0, codFeeMinor: 0 })).toBeNull();
    expect(estimateAmounts(null)).toBeNull();
  });
});
