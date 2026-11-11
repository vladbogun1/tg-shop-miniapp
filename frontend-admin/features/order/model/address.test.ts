import { describe, expect, it } from "vitest";
import { deliveryAddress, npRecipientIfDifferent } from "./address";

describe("deliveryAddress", () => {
  it("отделение", () => {
    expect(deliveryAddress({ npCityName: "Киев", npWarehouseName: "Отделение №1" })).toBe("Киев, Отделение №1");
  });
  it("курьер — улица, дом, квартира вместо отделения", () => {
    expect(
      deliveryAddress({ npCityName: "Киев", npWarehouseName: "старое", npServiceType: "DOORS", npStreetName: "Крещатик", npBuilding: "5", npFlat: "7" }),
    ).toBe("Киев, Крещатик, д. 5, кв. 7");
  });
  it("пусто — пустая строка", () => {
    expect(deliveryAddress({ npCityName: null, npWarehouseName: null })).toBe("");
  });
});

describe("npRecipientIfDifferent", () => {
  it("совпадает с ФИО заказа — не показываем", () => {
    expect(npRecipientIfDifferent({ customerName: "Иванов Иван", recipientLastName: "Иванов", recipientFirstName: "Иван" })).toBeNull();
  });
  it("отличается — полное имя", () => {
    expect(npRecipientIfDifferent({ customerName: "Ваня", recipientLastName: "Иванов", recipientFirstName: "Иван", recipientMiddleName: "Петрович" })).toBe(
      "Иванов Иван Петрович",
    );
  });
  it("нет частей — null", () => {
    expect(npRecipientIfDifferent({ customerName: "Ваня" })).toBeNull();
  });
});
