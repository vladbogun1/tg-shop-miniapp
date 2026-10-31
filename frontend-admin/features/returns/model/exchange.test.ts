import { describe, expect, it } from "vitest";
import type { Product, ProductVariant } from "@/lib/api";
import {
  addToLines,
  backValueOf,
  buildExchangeBody,
  defaultExchangeOutcome,
  exchangeLeft,
  exchangeMoney,
  filterProducts,
  newValueOf,
  stockOf,
  takenBy,
  type BackLine,
  type NewLine,
} from "./exchange";
import type { ReturnOrder } from "./types";

const product = (over: Partial<Product> = {}): Product =>
  ({ id: "p1", title: "Клавиатура", priceMinor: 8000, stock: 5, variants: [], ...over }) as Product;
const variant = (id: string, stock: number): ProductVariant => ({ id, name: id, stock }) as ProductVariant;

const order = (over: Partial<ReturnOrder> = {}): ReturnOrder =>
  ({
    deliveryMethod: "NOVA_POSHTA",
    receivedMinor: 10000,
    refundedMinor: 0,
    items: [
      { id: 1, quantity: 2, returnedQty: 0, priceMinor: 5000, unitPaidMinor: 4500, gift: false },
      { id: 2, quantity: 1, returnedQty: 0, priceMinor: 0, gift: true },
    ],
    ...over,
  }) as ReturnOrder;

describe("остатки под замену", () => {
  it("вариант — свой остаток, товар с вариантами — сумма вариантов", () => {
    const p = product({ variants: [variant("a", 2), variant("b", 3)] });
    expect(stockOf([], p, variant("a", 2))).toBe(2);
    expect(stockOf([], p, null)).toBe(5);
    expect(stockOf([], product({ stock: 4 }), null)).toBe(4);
  });
  it("уже взятое строками списка вычитается", () => {
    const p = product();
    const lines: NewLine[] = [{ key: "p1:", product: p, variant: null, qty: 3 }];
    expect(takenBy(lines, "p1")).toBe(3);
    expect(stockOf(lines, p, null)).toBe(2);
  });
  it("добавление: новая строка или +1 к существующей", () => {
    const p = product();
    const once = addToLines([], p, null);
    expect(once).toEqual([{ key: "p1:", product: p, variant: null, qty: 1 }]);
    expect(addToLines(once, p, null)[0].qty).toBe(2);
    expect(addToLines(once, p, variant("a", 1))).toHaveLength(2);
  });
});

describe("поиск товара на замену", () => {
  const list = [
    product({ id: "1", title: "Мышь Lamzu" }),
    product({ id: "2", title: "Мышь архивная", archived: true } as Partial<Product>),
    product({ id: "3", title: "Коврик", active: false } as Partial<Product>),
    product({ id: "4", title: "Клавиатура" }),
  ];
  it("скрытые и архивные не попадают", () => {
    expect(filterProducts(list, "").map((p) => p.id)).toEqual(["1", "4"]);
  });
  it("поиск без учёта регистра", () => {
    expect(filterProducts(list, " LAMZU ").map((p) => p.id)).toEqual(["1"]);
  });
  it("не больше 40 строк", () => {
    const many = Array.from({ length: 60 }, (_, i) => product({ id: String(i), title: `Товар ${i}` }));
    expect(filterProducts(many, "")).toHaveLength(40);
  });
});

describe("деньги обмена", () => {
  it("зачёт — по цене, за которую заплатил покупатель; подарок бесплатный", () => {
    const back: Record<number, BackLine> = { 1: { qty: 2, outcome: "RESTOCK" }, 2: { qty: 1, outcome: "RESTOCK" } };
    expect(backValueOf(order(), back)).toBe(9000);
  });
  it("newValueOf суммирует цену на количество", () => {
    const lines: NewLine[] = [
      { key: "a", product: product({ priceMinor: 1000 }), variant: null, qty: 2 },
      { key: "b", product: product({ priceMinor: 500 }), variant: null, qty: 1 },
    ];
    expect(newValueOf(lines)).toBe(2500);
  });
  it("дороже — доплата", () => {
    expect(exchangeMoney(order(), 4500, 8000)).toEqual({ credit: 4500, due: 3500, over: 0 });
  });
  it("дешевле — остаток к возврату", () => {
    expect(exchangeMoney(order(), 9000, 2000)).toEqual({ credit: 2000, due: 0, over: 7000 });
  });
  it("зачёт ограничен тем, что оплачено и не возвращено", () => {
    const o = order({ receivedMinor: 5000, refundedMinor: 3000 });
    expect(exchangeMoney(o, 9000, 9000)).toEqual({ credit: 2000, due: 7000, over: 0 });
  });
});

describe("строки возврата в обмене", () => {
  it("exchangeLeft и исход по умолчанию", () => {
    expect(exchangeLeft({ quantity: 3, returnedQty: 1 } as ReturnOrder["items"][number])).toBe(2);
    expect(defaultExchangeOutcome(order())).toBe("IN_TRANSIT");
    expect(defaultExchangeOutcome(order({ deliveryMethod: "PICKUP" }))).toBe("RESTOCK");
  });
});

describe("buildExchangeBody", () => {
  it("в запрос идут только строки с количеством, заметка обрезается", () => {
    const lines: NewLine[] = [{ key: "p1:v", product: product(), variant: variant("v", 1), qty: 2 }];
    const body = buildExchangeBody(
      { 1: { qty: 1, outcome: "DEFECT" }, 2: { qty: 0, outcome: "RESTOCK" } },
      lines,
      "APPROVED",
      false,
      "  так вышло ",
    );
    expect(body).toEqual({
      returned: [{ itemId: 1, quantity: 1, outcome: "DEFECT" }],
      items: [{ productId: "p1", variantId: "v", quantity: 2 }],
      targetStatus: "APPROVED",
      notifyCustomer: false,
      note: "так вышло",
    });
  });
  it("без варианта variantId не передаётся", () => {
    const lines: NewLine[] = [{ key: "p1:", product: product(), variant: null, qty: 1 }];
    expect(buildExchangeBody({}, lines, "NEW", true, "").items[0].variantId).toBeUndefined();
  });
});
