import { describe, expect, it } from "vitest";
import {
  amountHint,
  buildReturnBody,
  buildReturnLines,
  defaultWhere,
  deriveReturn,
  isMoneyOnly,
  nextDisabled,
  outcomeText,
  parseMinor,
  toInput,
  unitPaid,
  unitsLeft,
  type WizardChoice,
} from "./return-wizard";
import type { ReturnOrder, ReturnOrderItem } from "./types";

const item = (over: Partial<ReturnOrderItem>): ReturnOrderItem =>
  ({
    id: 1,
    title: "Мышь",
    quantity: 2,
    priceMinor: 5000,
    gift: false,
    returnedQty: 0,
    returnPendingQty: 0,
    ...over,
  }) as ReturnOrderItem;

const order = (over: Partial<ReturnOrder> = {}): ReturnOrder =>
  ({
    id: "o1",
    status: "DELIVERED",
    deliveryMethod: "NOVA_POSHTA",
    currency: "UAH",
    totalMinor: 10000,
    prepaymentMinor: 0,
    receivedMinor: 10000,
    refundedMinor: 0,
    uncollectedMinor: 0,
    admin: { monoRefundableMinor: 10000, retainedMinor: 0 },
    items: [item({})],
    ...over,
  }) as ReturnOrder;

const adminOf = (mono: number, retained = 0) =>
  ({ monoRefundableMinor: mono, retainedMinor: retained }) as ReturnOrder["admin"];

const choice = (over: Partial<WizardChoice> = {}): WizardChoice => ({
  where: "HERE",
  picked: {},
  defect: {},
  giftChoice: {},
  amount: "",
  viaMono: true,
  ...over,
});

const fmt = (m: number) => `${m / 100} ₴`;

describe("деньги в копейках", () => {
  it("parseMinor понимает запятую и отбрасывает отрицательное", () => {
    expect(parseMinor("12,5")).toBe(1250);
    expect(parseMinor("12.5")).toBe(1250);
    expect(parseMinor("-3")).toBe(0);
    expect(parseMinor("")).toBe(0);
  });
  it("toInput: 0 → пусто, иначе сумма без хвоста", () => {
    expect(toInput(0)).toBe("");
    expect(toInput(1250)).toBe("12.5");
    expect(toInput(10000)).toBe("100");
  });
});

describe("строки заказа", () => {
  it("unitsLeft вычитает вернувшееся и едущее назад", () => {
    expect(unitsLeft(item({ quantity: 5, returnedQty: 1, returnPendingQty: 2 }))).toBe(2);
  });
  it("unitPaid: цена со скидкой, подарок бесплатный", () => {
    expect(unitPaid(item({ unitPaidMinor: 4500 }))).toBe(4500);
    expect(unitPaid(item({ gift: true, unitPaidMinor: undefined }))).toBe(0);
    expect(unitPaid(item({ unitPaidMinor: undefined }))).toBe(5000);
  });
  it("только деньги: отклонённый и ещё не отправленный", () => {
    expect(isMoneyOnly(order({ status: "REJECTED" }))).toBe(true);
    expect(isMoneyOnly(order({ status: "NEW" }))).toBe(true);
    expect(isMoneyOnly(order({ status: "APPROVED" }))).toBe(true);
    expect(isMoneyOnly(order({ status: "DELIVERED" }))).toBe(false);
  });
  it("defaultWhere: по почте — едет назад, самовывоз — уже у нас", () => {
    expect(defaultWhere(order())).toBe("POST");
    expect(defaultWhere(order({ status: "SHIPPED" }))).toBe("POST");
    expect(defaultWhere(order({ deliveryMethod: "PICKUP" }))).toBe("HERE");
    expect(defaultWhere(order({ status: "REJECTED" }))).toBe("HERE");
  });
});

describe("deriveReturn: предлагаемая сумма", () => {
  it("доставленный заказ: платил за возвращаемое, но не больше полученного", () => {
    const d = deriveReturn(order(), choice({ picked: { 1: 1 } }), fmt);
    expect(d.goodsValue).toBe(5000);
    expect(d.suggested).toBe(5000);
    expect(d.limit).toBe(10000);
  });
  it("товар остаётся у покупателя — сумма вводится руками, пока 0 нельзя", () => {
    const d = deriveReturn(order(), choice({ where: "KEPT", picked: { 1: 1 } }), fmt);
    expect(d.suggested).toBe(0);
    expect(d.needsCompensation).toBe(true);
    expect(
      deriveReturn(order(), choice({ where: "KEPT", picked: { 1: 1 }, amount: "10" }), fmt).needsCompensation,
    ).toBe(false);
  });
  it("отклонённый заказ: можно вернуть всё полученное", () => {
    const d = deriveReturn(order({ status: "REJECTED" }), choice(), fmt);
    expect(d.moneyOnly).toBe(true);
    expect(d.suggested).toBe(10000);
  });
  it("не отправленный: только переплата", () => {
    const d = deriveReturn(order({ status: "APPROVED", receivedMinor: 12000 }), choice(), fmt);
    expect(d.overpaid).toBe(2000);
    expect(d.suggested).toBe(2000);
    expect(d.limit).toBe(2000);
  });
  it("уже возвращённое и удержанное уменьшает остаток", () => {
    const o = order({ refundedMinor: 3000, admin: adminOf(7000, 1000) });
    expect(deriveReturn(o, choice(), fmt).cap).toBe(6000);
  });
});

describe("deriveReturn: частичный выкуп на почте (SHIPPED)", () => {
  const shipped = (over: Partial<ReturnOrder> = {}) =>
    order({ status: "SHIPPED", receivedMinor: 3000, admin: adminOf(0), ...over });
  it("отказанное снимается с наложки", () => {
    const d = deriveReturn(shipped(), choice({ where: "POST", picked: { 1: 1 } }), fmt);
    expect(d.pickup).toBe(true);
    expect(d.codBefore).toBe(7000);
    expect(d.codAfter).toBe(2000);
    expect(d.suggested).toBe(0);
  });
  it("отказ от всей посылки блокирует «Далее»", () => {
    const c = choice({ where: "POST", picked: { 1: 2 } });
    const d = deriveReturn(shipped(), c, fmt);
    expect(d.refusedAll).toBe(true);
    expect(nextDisabled(1, d, c)).toBe(true);
  });
  it("предоплата больше оставшегося — предлагается разница", () => {
    const d = deriveReturn(shipped({ receivedMinor: 9000 }), choice({ where: "POST", picked: { 1: 1 } }), fmt);
    expect(d.suggested).toBe(4000);
  });
});

describe("deriveReturn: через какой канал", () => {
  it("всё через monobank — банк вернёт сам", () => {
    const d = deriveReturn(order(), choice({ picked: { 1: 1 }, amount: "50" }), fmt);
    expect(d.monoPossible).toBe(true);
    expect(d.useMono).toBe(true);
  });
  it("сумма больше доступного банку — с личных средств", () => {
    const o = order({ admin: adminOf(3000) });
    expect(deriveReturn(o, choice({ picked: { 1: 1 }, amount: "50" }), fmt).monoPossible).toBe(false);
  });
  it("предоплата + наложка — банк не возвращает", () => {
    const d = deriveReturn(order({ prepaymentMinor: 3000 }), choice({ picked: { 1: 1 }, amount: "10" }), fmt);
    expect(d.prepayScheme).toBe(true);
    expect(d.useMono).toBe(false);
  });
  it("«с личных средств» — выбор администратора", () => {
    expect(deriveReturn(order(), choice({ picked: { 1: 1 }, amount: "50", viaMono: false }), fmt).useMono).toBe(false);
  });
});

describe("deriveReturn: ошибки", () => {
  it("сумма выше лимита", () => {
    const d = deriveReturn(order(), choice({ picked: { 1: 1 }, amount: "150" }), fmt);
    expect(d.errors).toEqual(["Вернуть можно не больше 100 ₴."]);
    expect(nextDisabled(2, d, choice())).toBe(true);
  });
  it("только деньги: нулевая сумма не пускает дальше", () => {
    const o = order({ status: "REJECTED" });
    expect(nextDisabled(2, deriveReturn(o, choice(), fmt), choice())).toBe(true);
    expect(nextDisabled(2, deriveReturn(o, choice({ amount: "10" }), fmt), choice({ amount: "10" }))).toBe(false);
  });
});

describe("подарки", () => {
  const withGift = order({
    items: [item({}), item({ id: 2, title: "Коврик", quantity: 1, gift: true, priceMinor: 0 })],
  });
  it("подарок спрашивается, только если товар возвращается", () => {
    expect(deriveReturn(withGift, choice({ picked: { 1: 1 } }), fmt).askGift).toBe(true);
    expect(deriveReturn(withGift, choice({ where: "KEPT", picked: { 1: 1 } }), fmt).askGift).toBe(false);
    expect(deriveReturn(withGift, choice(), fmt).askGift).toBe(false);
  });
  it("без выбора по подарку «Далее» закрыта", () => {
    const c = choice({ picked: { 1: 1 } });
    expect(nextDisabled(1, deriveReturn(withGift, c, fmt), c)).toBe(true);
    const c2 = choice({ picked: { 1: 1 }, giftChoice: { 2: "LEAVE" } });
    expect(nextDisabled(1, deriveReturn(withGift, c2, fmt), c2)).toBe(false);
  });
  it("«забрать» подарок уходит в строки, «оставить» — нет", () => {
    const take = choice({ picked: { 1: 1 }, giftChoice: { 2: "TAKE" } });
    expect(buildReturnLines(deriveReturn(withGift, take, fmt), take)).toEqual([
      { itemId: 1, quantity: 1, outcome: "RESTOCK" },
      { itemId: 2, quantity: 1, outcome: "RESTOCK" },
    ]);
    const leave = choice({ picked: { 1: 1 }, giftChoice: { 2: "LEAVE" } });
    expect(buildReturnLines(deriveReturn(withGift, leave, fmt), leave)).toEqual([
      { itemId: 1, quantity: 1, outcome: "RESTOCK" },
    ]);
  });
});

describe("buildReturnLines", () => {
  it("уже у нас: целое — на склад, брак — в брак", () => {
    const c = choice({ picked: { 1: 2 }, defect: { 1: 1 } });
    expect(buildReturnLines(deriveReturn(order(), c, fmt), c)).toEqual([
      { itemId: 1, quantity: 1, outcome: "RESTOCK" },
      { itemId: 1, quantity: 1, outcome: "DEFECT" },
    ]);
  });
  it("едет назад и остаётся у покупателя — один исход на строку", () => {
    const post = choice({ where: "POST", picked: { 1: 2 }, defect: { 1: 1 } });
    expect(buildReturnLines(deriveReturn(order(), post, fmt), post)).toEqual([
      { itemId: 1, quantity: 2, outcome: "IN_TRANSIT" },
    ]);
    const kept = choice({ where: "KEPT", picked: { 1: 1 } });
    expect(buildReturnLines(deriveReturn(order(), kept, fmt), kept)).toEqual([
      { itemId: 1, quantity: 1, outcome: "KEPT" },
    ]);
  });
});

describe("buildReturnBody", () => {
  it("monobank: сумма уходит в monoRefundMinor, ручных возвратов нет", () => {
    const c = choice({ picked: { 1: 1 }, amount: "50" });
    const body = buildReturnBody(deriveReturn(order(), c, fmt), c, "  коммент ", true);
    expect(body).toMatchObject({
      monoRefundMinor: 5000,
      refunds: [],
      retainMinor: 0,
      note: "коммент",
      notifyCustomer: true,
    });
  });
  it("с личных средств: ручной возврат CARD_TRANSFER, банку 0", () => {
    const c = choice({ picked: { 1: 1 }, amount: "50", viaMono: false });
    const body = buildReturnBody(deriveReturn(order(), c, fmt), c, "", false);
    expect(body.monoRefundMinor).toBe(0);
    expect(body.refunds).toEqual([{ channel: "CARD_TRANSFER", amountMinor: 5000, note: "с личных средств" }]);
    expect(body.note).toBeUndefined();
    expect(body.notifyCustomer).toBe(false);
  });
  it("без денег: ни возвратов, ни банка", () => {
    const c = choice({ picked: { 1: 1 } });
    const body = buildReturnBody(deriveReturn(order(), c, fmt), c, "", true);
    expect(body.refunds).toEqual([]);
    expect(body.monoRefundMinor).toBe(0);
  });
});

describe("тексты", () => {
  it("outcomeText по месту и браку", () => {
    expect(outcomeText("POST", 0, 2)).toBe("едет к нам");
    expect(outcomeText("KEPT", 0, 2)).toBe("остаётся у покупателя");
    expect(outcomeText("HERE", 0, 2)).toBe("на склад");
    expect(outcomeText("HERE", 2, 2)).toBe("брак — спишется");
    expect(outcomeText("HERE", 1, 3)).toBe("на склад 2, брак 1");
  });
  it("amountHint: компенсация, наложка, подставленная и полная сумма", () => {
    const d = deriveReturn(order(), choice({ picked: { 1: 1 }, amount: "50" }), fmt);
    expect(amountHint(d, "KEPT", fmt)).toContain("раз товар остаётся");
    expect(amountHint(d, "HERE", fmt)).toContain("Подставили полную сумму");
    expect(amountHint({ ...d, amountMinor: 100 }, "HERE", fmt)).toBe("Полная сумма — 50 ₴. 0 — без возврата денег.");
    expect(amountHint({ ...d, pickup: true, suggested: 0 }, "POST", fmt)).toContain("Возвращать нечего");
    expect(amountHint({ ...d, pickup: true, suggested: 4000 }, "POST", fmt)).toContain("к возврату 40 ₴");
  });
});
