import { describe, expect, it } from "vitest";
import { deliveryAddress, npRecipientIfDifferent } from "./address";

const addr = { npCityName: null, npWarehouseName: null, npServiceType: null, npStreetName: null, npBuilding: null, npFlat: null };
const names = { recipientLastName: null, recipientFirstName: null, recipientMiddleName: null };

describe("deliveryAddress", () => {
  it("отделение", () => {
    expect(deliveryAddress({ ...addr, npCityName: "Киев", npWarehouseName: "Отделение №1" })).toBe("Киев, Отделение №1");
  });
  it("курьер — улица, дом, квартира вместо отделения", () => {
    expect(
      deliveryAddress({ ...addr, npCityName: "Киев", npWarehouseName: "старое", npServiceType: "DOORS", npStreetName: "Крещатик", npBuilding: "5", npFlat: "7" }),
    ).toBe("Киев, Крещатик, д. 5, кв. 7");
  });
  it("пусто — пустая строка", () => {
    expect(deliveryAddress(addr)).toBe("");
  });
});

describe("npRecipientIfDifferent", () => {
  it("совпадает с ФИО заказа — не показываем", () => {
    expect(npRecipientIfDifferent({ ...names, customerName: "Иванов Иван", recipientLastName: "Иванов", recipientFirstName: "Иван" })).toBeNull();
  });
  it("отличается — полное имя", () => {
    expect(npRecipientIfDifferent({ ...names, customerName: "Ваня", recipientLastName: "Иванов", recipientFirstName: "Иван", recipientMiddleName: "Петрович" })).toBe(
      "Иванов Иван Петрович",
    );
  });
  it("нет частей — null", () => {
    expect(npRecipientIfDifferent({ ...names, customerName: "Ваня" })).toBeNull();
  });
});
