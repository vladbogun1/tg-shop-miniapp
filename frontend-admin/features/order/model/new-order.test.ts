import { describe, expect, it } from "vitest";
import type { Product } from "@shop/core/types";
import {
  addOrderLine,
  buildCreateBody,
  canSubmitOrder,
  defaultChannel,
  EMPTY_NEW_ORDER,
  isOrderDirty,
  isTgIdValid,
  searchProducts,
  type NewOrderValues,
  type OrderLine,
} from "./new-order";

const product = (id: string, title: string, extra: Partial<Product> = {}) => ({ id, title, priceMinor: 1000, currency: "UAH", ...extra }) as Product;
const line = (p: Product, qtyText = "1"): OrderLine => ({ key: `${p.id}:`, product: p, variant: null, qtyText });
const ready = (extra: Partial<NewOrderValues> = {}): NewOrderValues => ({ ...EMPTY_NEW_ORDER, name: "Иван", phone: "+380", paymentId: "pay-1", ...extra });

describe("addOrderLine", () => {
  it("тот же товар — +1, новый — в конец", () => {
    const a = product("a", "A");
    const once = addOrderLine([], a, null);
    expect(once).toHaveLength(1);
    expect(addOrderLine(once, a, null)[0]?.qtyText).toBe("2");
    expect(addOrderLine(once, product("b", "B"), null)).toHaveLength(2);
  });

  it("вариант делает отдельную строку", () => {
    const a = product("a", "A");
    const withVariant = addOrderLine(addOrderLine([], a, null), a, { id: "v1", name: "XL" } as never);
    expect(withVariant.map((l) => l.key)).toEqual(["a:", "a:v1"]);
  });
});

describe("canSubmitOrder", () => {
  const l = line(product("a", "A"));
  it("нужны товар, имя, телефон и способ оплаты", () => {
    expect(canSubmitOrder([l], ready())).toBe(true);
    expect(canSubmitOrder([], ready())).toBe(false);
    expect(canSubmitOrder([l], ready({ name: " " }))).toBe(false);
    expect(canSubmitOrder([l], ready({ phone: "" }))).toBe(false);
    expect(canSubmitOrder([l], ready({ paymentId: "" }))).toBe(false);
  });

  it("количество от 1 и корректный Telegram id", () => {
    expect(canSubmitOrder([line(product("a", "A"), "0")], ready())).toBe(false);
    expect(canSubmitOrder([l], ready({ tgId: "12345" }))).toBe(true);
    expect(isTgIdValid("")).toBe(true);
    expect(isTgIdValid("12a")).toBe(false);
    expect(isTgIdValid("1".repeat(19))).toBe(false);
  });
});

describe("buildCreateBody", () => {
  it("Нова пошта: город и отделение уходят, пустые — нет; сумма «получено» в копейках", () => {
    const body = buildCreateBody([line(product("a", "A"), "2")], ready({ city: " Харьков ", warehouse: "", paidText: "10,50", tgId: "77" }));
    expect(body).toMatchObject({
      items: [{ productId: "a", variantId: null, quantity: 2 }],
      customerName: "Иван",
      deliveryMethod: "NOVA_POSHTA",
      npCityName: "Харьков",
      npWarehouseName: undefined,
      paymentOptionId: "pay-1",
      tgUserId: 77,
      paidMinor: 1050,
      paidChannel: "CARD_TRANSFER",
    });
  });

  it("самовывоз: адрес доставки не отправляется", () => {
    const body = buildCreateBody([line(product("a", "A"))], ready({ delivery: "PICKUP", city: "Харьков", warehouse: "1" }));
    expect(body.npCityName).toBeUndefined();
    expect(body.npWarehouseName).toBeUndefined();
  });
});

describe("прочее", () => {
  it("канал по умолчанию: самовывоз — наличные", () => {
    expect(defaultChannel("PICKUP")).toBe("CASH");
    expect(defaultChannel("NOVA_POSHTA")).toBe("CARD_TRANSFER");
  });

  it("форма «грязная» только когда что-то введено", () => {
    expect(isOrderDirty([], EMPTY_NEW_ORDER)).toBe(false);
    expect(isOrderDirty([], { ...EMPTY_NEW_ORDER, note: "x" })).toBe(true);
  });

  it("поиск: пусто — ничего, архивные не показываем, не больше 8", () => {
    const many = Array.from({ length: 12 }, (_, i) => product(String(i), `Мышь ${i}`));
    expect(searchProducts(many, " ")).toEqual([]);
    expect(searchProducts(many, "мышь")).toHaveLength(8);
    expect(searchProducts([product("a", "Мышь", { archived: true })], "мышь")).toEqual([]);
  });
});
