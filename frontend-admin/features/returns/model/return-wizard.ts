/**
 * Расчёты мастера возврата (POST /orders/{id}/returns): какие строки можно вернуть, сколько заплатил
 * покупатель за возвращаемое, сколько можно вернуть деньгами, откуда брать деньги и что уйдёт на сервер.
 * Чистые функции без React — на них держится вся денежная логика мастера (см. return-wizard.test.ts).
 */
import { toMajor, toMinor } from "@/lib/money";
import type { ReturnOutcome, ReturnWizardBody } from "../api";
import type { GiftChoice, ReturnOrder, ReturnOrderItem, ReturnWhere } from "./types";

export type WizardStep = 1 | 2 | 3;

/** "12,5" / "12.5" → minor units (0 for anything unreadable or negative). */
export function parseMinor(s: string): number {
  return Math.max(0, toMinor(s));
}

export function toInput(minor: number): string {
  return minor > 0 ? String(toMajor(minor)) : "";
}

/** Сколько единиц позиции ещё можно вернуть. */
export function unitsLeft(it: ReturnOrderItem): number {
  return it.quantity - (it.returnedQty ?? 0) - (it.returnPendingQty ?? 0);
}

/** Сколько покупатель заплатил за единицу (со скидкой заказа). */
export function unitPaid(it: ReturnOrderItem): number {
  return it.unitPaidMinor ?? (it.gift ? 0 : it.priceMinor);
}

/** Только деньги: отклонённый заказ (товар принимается «Посылкой вернулась») или переплата до отправки. */
export function isMoneyOnly(order: ReturnOrder): boolean {
  return order.status === "REJECTED" || order.status === "NEW" || order.status === "APPROVED";
}

/** Где товар по умолчанию: доставленная посылка (или отказанная часть на почте) едет назад, самовывоз — уже у нас. */
export function defaultWhere(order: ReturnOrder): ReturnWhere {
  const delivered = order.status === "DELIVERED";
  const shipped = order.status === "SHIPPED";
  return (delivered || shipped) && order.deliveryMethod === "NOVA_POSHTA" ? "POST" : "HERE";
}

/** Выбор пользователя на трёх шагах мастера. */
export interface WizardChoice {
  where: ReturnWhere;
  /** itemId → сколько единиц возвращают (только оплаченные строки; подарок — по своему выбору). */
  picked: Record<number, number>;
  /** itemId → из них бракованных (только когда товар уже у нас). */
  defect: Record<number, number>;
  giftChoice: Record<number, GiftChoice>;
  amount: string;
  viaMono: boolean;
}

export interface ReturnDerived {
  moneyOnly: boolean;
  delivered: boolean;
  shipped: boolean;
  cur: string;
  /** Что ещё можно вернуть деньгами: получено − возвращено − удержано отказом. */
  cap: number;
  monoLeft: number;
  overpaid: number;
  paidLines: ReturnOrderItem[];
  giftLines: ReturnOrderItem[];
  units: number;
  allPaidBack: boolean;
  askGift: boolean;
  /** Что покупатель заплатил за возвращаемые единицы — подсказка, ничем не уменьшается. */
  goodsValue: number;
  /** Частичный выкуп на почте: отказанное снимается с наложки. */
  pickup: boolean;
  codBefore: number;
  codAfter: number;
  suggested: number;
  amountMinor: number;
  prepayScheme: boolean;
  monoPossible: boolean;
  useMono: boolean;
  limit: number;
  errors: string[];
  needsCompensation: boolean;
  /** Ничего не принято на почте — это отказ от посылки. */
  refusedAll: boolean;
}

/** Деньги заказа: сколько ещё можно вернуть, сколько через банк, переплата. */
function moneyCaps(order: ReturnOrder) {
  const admin = order.admin ?? null;
  const received = Math.max(0, order.receivedMinor ?? 0);
  const returnedMoney = Math.max(0, order.refundedMinor ?? 0);
  const retainedAlready = admin?.retainedMinor ?? 0;
  return {
    received,
    returnedMoney,
    cap: Math.max(0, received - returnedMoney - retainedAlready),
    monoLeft: admin?.monoRefundableMinor ?? 0,
    overpaid: Math.max(0, received - returnedMoney - order.totalMinor),
  };
}

/** Частичный выкуп на почте: что снимется с наложки и сколько уже заплачено сверх оставшегося. */
function pickupAmounts(order: ReturnOrder, received: number, returnedMoney: number, goodsValue: number) {
  const collectable = Math.max(0, order.totalMinor - Math.max(0, order.uncollectedMinor ?? 0));
  const collectableAfter = Math.max(0, collectable - goodsValue);
  return {
    pickupOver: Math.max(0, received - returnedMoney - collectableAfter),
    codBefore: Math.max(0, collectable - received),
    codAfter: Math.max(0, collectableAfter - received),
  };
}

function refundLimit(
  order: ReturnOrder,
  pickup: boolean,
  m: { overpaid: number; cap: number },
  pickupOver: number,
): number {
  if (order.status === "NEW" || order.status === "APPROVED") return Math.min(m.overpaid, m.cap);
  return pickup ? Math.min(pickupOver, m.cap) : m.cap;
}

/** Строки, которые ещё можно вернуть, и сколько единиц выбрано; подарок спрашивается, только если товар возвращается. */
function pickedLines(order: ReturnOrder, c: WizardChoice, moneyOnly: boolean) {
  const paidLines = order.items.filter((it) => it.id != null && !it.gift && unitsLeft(it) > 0);
  const giftLines = order.items.filter((it) => it.id != null && it.gift && unitsLeft(it) > 0);
  const units = Object.values(c.picked).reduce((s, n) => s + n, 0);
  const allPaidBack = paidLines.length > 0 && paidLines.every((it) => (c.picked[it.id!] ?? 0) >= unitsLeft(it));
  const askGift = !moneyOnly && c.where !== "KEPT" && units > 0 && giftLines.length > 0;
  return { paidLines, giftLines, units, allPaidBack, askGift };
}

export function deriveReturn(
  order: ReturnOrder,
  c: WizardChoice,
  formatMoney: (minor: number) => string,
): ReturnDerived {
  const moneyOnly = isMoneyOnly(order);
  const delivered = order.status === "DELIVERED";
  const shipped = order.status === "SHIPPED";
  const { received, returnedMoney, cap, monoLeft, overpaid } = moneyCaps(order);

  const { paidLines, giftLines, units, allPaidBack, askGift } = pickedLines(order, c, moneyOnly);

  const goodsValue = order.items.reduce((s, it) => s + (it.id != null ? (c.picked[it.id] ?? 0) * unitPaid(it) : 0), 0);
  const pickup = !moneyOnly && shipped && c.where !== "KEPT";
  const { pickupOver, codBefore, codAfter } = pickupAmounts(order, received, returnedMoney, goodsValue);
  const suggested = suggestedRefund({
    pickup,
    pickupOver,
    cap,
    moneyOnly,
    status: order.status,
    overpaid,
    where: c.where,
    goodsValue,
  });

  const amountMinor = parseMinor(c.amount);
  const prepayScheme = order.prepaymentMinor > 0 && order.prepaymentMinor < order.totalMinor;
  // The bank can only give back what went through it; prepayment + наложка → own money.
  const monoPossible = !prepayScheme && monoLeft > 0 && amountMinor <= monoLeft;
  const limit = refundLimit(order, pickup, { overpaid, cap }, pickupOver);

  return {
    moneyOnly,
    delivered,
    shipped,
    cur: order.currency ?? "UAH",
    cap,
    monoLeft,
    overpaid,
    paidLines,
    giftLines,
    units,
    allPaidBack,
    askGift,
    goodsValue,
    pickup,
    codBefore,
    codAfter,
    suggested,
    amountMinor,
    prepayScheme,
    monoPossible,
    useMono: monoPossible && c.viaMono,
    limit,
    errors: amountMinor > limit ? [`Вернуть можно не больше ${formatMoney(limit)}.`] : [],
    // Goods stay with the customer → a compensation is the whole point; «Далее» waits for the amount.
    needsCompensation: !moneyOnly && c.where === "KEPT" && amountMinor === 0,
    refusedAll: pickup && allPaidBack,
  };
}

/** Подсказка под полем суммы: что подставлено и почему. */
export function amountHint(d: ReturnDerived, where: ReturnWhere, formatMoney: (minor: number) => string): string {
  if (where === "KEPT" && !d.moneyOnly) return "Сколько денег отдаёте покупателю, раз товар остаётся у него.";
  if (d.pickup && d.suggested === 0) {
    return "За невыкупленное покупатель не платил — оно просто не войдёт в наложку. Возвращать нечего.";
  }
  if (d.pickup) {
    return `Покупатель заплатил заранее больше, чем стоит то, что он забрал: к возврату ${formatMoney(d.suggested)}.`;
  }
  if (d.amountMinor === d.suggested) {
    return "Подставили полную сумму. Можно уменьшить, если договорились иначе; 0 — без возврата денег.";
  }
  return `Полная сумма — ${formatMoney(d.suggested)}. 0 — без возврата денег.`;
}

function suggestedRefund(a: {
  pickup: boolean;
  pickupOver: number;
  cap: number;
  moneyOnly: boolean;
  status: string;
  overpaid: number;
  where: ReturnWhere;
  goodsValue: number;
}): number {
  if (a.pickup) return Math.min(a.pickupOver, a.cap);
  if (a.moneyOnly) return a.status === "REJECTED" ? a.cap : Math.min(a.overpaid, a.cap);
  if (a.where === "KEPT") return 0;
  return Math.min(a.goodsValue, a.cap);
}

/** «Далее» на шаге заблокирована? */
export function nextDisabled(step: WizardStep, d: ReturnDerived, c: WizardChoice): boolean {
  if (step === 1) return d.units === 0 || d.refusedAll || (d.askGift && d.giftLines.some((g) => !c.giftChoice[g.id!]));
  return d.errors.length > 0 || d.needsCompensation || (d.moneyOnly && d.amountMinor === 0);
}

/** Строки тела запроса: что куда возвращается. */
export function buildReturnLines(d: ReturnDerived, c: WizardChoice): ReturnWizardBody["lines"] {
  const out: ReturnWizardBody["lines"] = [];
  const push = (it: ReturnOrderItem, qty: number, outcome: ReturnOutcome) => {
    if (qty > 0) out.push({ itemId: it.id!, quantity: qty, outcome });
  };
  for (const it of d.paidLines) {
    const q = c.picked[it.id!] ?? 0;
    if (q <= 0) continue;
    if (c.where === "POST") push(it, q, "IN_TRANSIT");
    else if (c.where === "KEPT") push(it, q, "KEPT");
    else {
      const broken = Math.min(c.defect[it.id!] ?? 0, q);
      push(it, q - broken, "RESTOCK");
      push(it, broken, "DEFECT");
    }
  }
  if (d.askGift) {
    for (const g of d.giftLines) {
      if (c.giftChoice[g.id!] === "TAKE") push(g, unitsLeft(g), c.where === "POST" ? "IN_TRANSIT" : "RESTOCK");
    }
  }
  return out;
}

export function buildReturnBody(d: ReturnDerived, c: WizardChoice, note: string, notify: boolean): ReturnWizardBody {
  return {
    lines: buildReturnLines(d, c),
    refunds:
      !d.useMono && d.amountMinor > 0
        ? [
            {
              channel: "CARD_TRANSFER",
              amountMinor: d.amountMinor,
              note: "с личных средств",
            },
          ]
        : [],
    monoRefundMinor: d.useMono ? d.amountMinor : 0,
    retainMinor: 0,
    note: note.trim() || undefined,
    notifyCustomer: notify,
  };
}

/** Что будет с единицей по итогам возврата — слова для шага «Проверьте». */
export function outcomeText(where: ReturnWhere, broken: number, qty: number): string {
  if (where === "POST") return "едет к нам";
  if (where === "KEPT") return "остаётся у покупателя";
  if (broken >= qty) return "брак — спишется";
  if (broken > 0) return `на склад ${qty - broken}, брак ${broken}`;
  return "на склад";
}
