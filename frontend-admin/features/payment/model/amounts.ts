import { toMinor } from "@/lib/money";

/** Что отметил админ в «Корректировке оплаты». */
export type PaymentMode = "prepayment" | "full" | "custom";

interface OrderSums {
  prepaymentMinor: number;
  totalMinor: number;
}

/** Сумма, введённая в поле (₴, запятая или точка) → копейки; пусто и не число — 0. */
export function parseMinor(input: string): number {
  return toMinor(input);
}

/** Сколько получено при выбранном способе: предоплата / вся сумма / своя; ничего не выбрано — 0. */
export function paymentAmount(mode: PaymentMode | null, order: OrderSums, customMinor: number): number {
  if (mode === "prepayment") return order.prepaymentMinor;
  if (mode === "full") return order.totalMinor;
  if (mode === "custom") return customMinor;
  return 0;
}

/** Можно подтверждать: способ выбран, сумма > 0 и не больше суммы заказа. */
export function isPaymentValid(mode: PaymentMode | null, amount: number, totalMinor: number): boolean {
  return mode !== null && amount > 0 && amount <= totalMinor;
}

/** Текст ошибки под полем возврата; undefined — сумма в порядке или ещё не введена. */
export function partialRefundError(input: string, partialMinor: number, leftMinor: number, fmt: (minor: number) => string): string | undefined {
  if (input.trim() === "") return undefined;
  if (partialMinor <= 0) return "Введите сумму больше нуля";
  if (partialMinor > leftMinor) return `Не больше ${fmt(leftMinor)} — столько осталось по этому платежу`;
  return undefined;
}
