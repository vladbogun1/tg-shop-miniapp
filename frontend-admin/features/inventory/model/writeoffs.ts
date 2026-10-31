import type { WriteoffRange, WriteoffReason } from "./types";

/** Причины списания: при уменьшении остатка в форме товара нужно выбрать одну из них. */
export const WRITEOFF_REASONS: { value: WriteoffReason; label: string }[] = [
  { value: "DEFECT", label: "Брак" },
  { value: "INVENTORY", label: "Инвентаризация/пересчёт" },
  { value: "MISSORT", label: "Пересорт" },
  { value: "SOLD_OFFLINE", label: "Продано вне сайта" },
  { value: "OTHER", label: "Другое" },
];

export const WRITEOFF_LABEL: Record<string, string> = Object.fromEntries(WRITEOFF_REASONS.map((r) => [r.value, r.label]));

export const WRITEOFF_RANGES: { value: WriteoffRange; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "halfyear", label: "Полгода" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];

/** Сколько единиц строки всё ещё числится списанным (не возвращено на полку). */
export function leftOf(l: { quantity: number; undoneQty?: number | null }): number {
  return l.quantity - (l.undoneQty ?? 0);
}
