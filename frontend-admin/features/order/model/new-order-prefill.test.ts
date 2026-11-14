import { describe, expect, it } from "vitest";
import type { AdminOrderDetail } from "../api";
import { prefillForCustomer, prefillFromOrder } from "./new-order-prefill";

const order = (extra: Record<string, unknown> = {}) =>
  ({
    customerName: "Петренко Іван",
    phone: "+380671112233",
    tgUserId: 555,
    deliveryMethod: "NOVA_POSHTA",
    npServiceType: "WAREHOUSE",
    npCityRef: "city-1",
    npCityName: "Київ",
    npWarehouseRef: "wh-1",
    npWarehouseName: "Відділення №1",
    comment: null,
    ...extra,
  }) as unknown as AdminOrderDetail;

describe("prefillFromOrder", () => {
  it("покупатель, Telegram id и отделение из заказа; товары и оплата — пустые", () => {
    const { values, legacyAddress } = prefillFromOrder(order());
    expect(values).toMatchObject({
      name: "Петренко Іван",
      phone: "+380671112233",
      tgId: "555",
      delivery: "NOVA_POSHTA",
      service: "WAREHOUSE",
      city: { ref: "city-1", name: "Київ" },
      wh: { ref: "wh-1", name: "Відділення №1" },
      paymentId: "",
      paidText: "",
      channel: "CARD_TRANSFER",
    });
    expect(legacyAddress).toBeNull();
  });

  it("курьер: улица, дом, квартира; отделения нет", () => {
    const { values } = prefillFromOrder(
      order({ npServiceType: "DOORS", npWarehouseRef: null, npWarehouseName: null, npStreetName: "вул. Шевченка", npBuilding: "12", npFlat: "5" })
    );
    expect(values).toMatchObject({ service: "DOORS", wh: null, street: { ref: null, name: "вул. Шевченка" }, building: "12", flat: "5" });
  });

  it("старый заказ с адресом текстом: города нет, адрес — подсказкой", () => {
    const { values, legacyAddress } = prefillFromOrder(
      order({ npCityRef: null, npWarehouseRef: null, npCityName: null, npWarehouseName: null, comment: "Закарпатська обл., с. Великі Ком'яти" })
    );
    expect(values.city).toBeNull();
    expect(values.wh).toBeNull();
    expect(legacyAddress).toBe("Закарпатська обл., с. Великі Ком'яти");
  });

  it("самовывоз: без адреса и подсказки, оплата по умолчанию наличными", () => {
    const { values, legacyAddress } = prefillFromOrder(order({ deliveryMethod: "PICKUP", npCityRef: null }));
    expect(values.delivery).toBe("PICKUP");
    expect(values.channel).toBe("CASH");
    expect(legacyAddress).toBeNull();
  });

  it("заказ без Telegram id из профиля — id профиля", () => {
    expect(prefillFromOrder(order({ tgUserId: null }), 777).values.tgId).toBe("777");
    expect(prefillFromOrder(order(), 777).values.tgId).toBe("555");
  });
});

describe("prefillForCustomer", () => {
  it("покупатель без заказов: имя и Telegram id", () => {
    expect(prefillForCustomer("Олег", 42).values).toMatchObject({ name: "Олег", tgId: "42", phone: "", city: null });
  });
});
