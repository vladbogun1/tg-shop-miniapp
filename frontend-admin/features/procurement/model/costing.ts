import { formatNumber, toMajor, toMinor } from "@shop/core/money";
import type { Allocation, ExpenseKind } from "./types";

export const ALLOCATIONS: { value: Allocation; label: string; hint: string }[] = [
  { value: "BY_VALUE", label: "По стоимости", hint: "Расходы делятся пропорционально цене закупки." },
  { value: "BY_QTY", label: "По штукам", hint: "Расходы делятся поровну на каждую штуку." },
  { value: "BY_WEIGHT", label: "По весу", hint: "Расходы делятся пропорционально весу (г) каждой штуки." },
  { value: "MANUAL", label: "Вручную", hint: "Доля расходов на позицию вводится руками." },
];
export const EXPENSE_KINDS: { value: ExpenseKind; label: string }[] = [
  { value: "FREIGHT", label: "Доставка" },
  { value: "CUSTOMS", label: "Растаможка" },
  { value: "BROKER", label: "Брокер" },
  { value: "DOMESTIC", label: "Доставка по Украине" },
  { value: "BANK", label: "Банк / комиссия" },
  { value: "OTHER", label: "Другое" },
];
export const expenseKindLabel = (k: string) => EXPENSE_KINDS.find((e) => e.value === k)?.label ?? k;

export const LOT_KIND_LABEL: Record<string, string> = { OPENING: "старый остаток", BATCH: "поставка", MANUAL: "ручная правка" };

/** «95,5» → 9550 копеек; пусто / не число → null. Для сумм ₴ в формах. */
export function inputToMinor(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? toMinor(n) : null;
}
/** Копейки → «95.50» для поля ввода (точка, без группировки); null → пусто. */
export function minorToInput(v: number | null | undefined): string {
  if (v == null) return "";
  const major = toMajor(v);
  return formatNumber(major === 0 ? 0 : major, "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}
