import { describe, expect, it } from "vitest";
import { codAmountMinor, onDeliveryUnpaid, orderCourierAddress, orderRecipientName } from "./np-order";

describe("заказ checkout v2", () => {
  it("получатель: поля ФИО, иначе customerName", () => {
    expect(orderRecipientName({ recipientLastName: "Шевченко", recipientFirstName: "Тарас", recipientMiddleName: null, customerName: "x" })).toBe(
      "Шевченко Тарас",
    );
    expect(orderRecipientName({ customerName: "Тест Покупець" })).toBe("Тест Покупець");
  });

  it("адрес курьера только у DOORS", () => {
    expect(orderCourierAddress({ npServiceType: "DOORS", npStreetName: "Хрещатик", npBuilding: "1", npFlat: "" })).toBe("Хрещатик, 1");
    expect(orderCourierAddress({ npServiceType: "WAREHOUSE", npStreetName: "Хрещатик" })).toBe("");
  });

  it("при отриманні: не оплачен — без онлайн-оплаты; сумма — наложка или остаток", () => {
    expect(onDeliveryUnpaid({ paymentOnDelivery: true, paid: false })).toBe(true);
    expect(onDeliveryUnpaid({ paymentOnDelivery: true, paid: true })).toBe(false);
    expect(onDeliveryUnpaid({ paid: false })).toBe(false);
    expect(codAmountMinor({ totalMinor: 5000, receivedMinor: 0 })).toBe(5000);
    expect(codAmountMinor({ totalMinor: 5000, shipment: { codMinor: 4900 } as never })).toBe(4900);
  });
});
