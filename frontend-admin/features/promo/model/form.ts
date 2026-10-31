import { toMajor, toMinor } from "@/lib/money";
import { usesOf } from "./promo";
import type { PromoBody, PromoCode } from "./types";

export type Mode = "percent" | "amount";

/** Поля формы промокода — строки, как их видит человек; числа получаются в `promoBody`. */
export interface PromoFormValues {
  code: string;
  mode: Mode;
  percent: string;
  amountMajor: string;
  capMajor: string;
  maxUses: string;
  active: boolean;
}

export const EMPTY_PROMO_FORM: PromoFormValues = {
  code: "",
  mode: "percent",
  percent: "",
  amountMajor: "",
  capMajor: "",
  maxUses: "",
  active: true,
};

/** Значения при открытии окна: пустая форма или правка существующего кода. */
export function initialForm(editing: PromoCode | null): PromoFormValues {
  return {
    code: editing?.code ?? "",
    mode: editing?.discountAmountMinor ? "amount" : "percent",
    percent: editing?.discountPercent ? String(editing.discountPercent) : "",
    amountMajor: editing?.discountAmountMinor ? String(toMajor(editing.discountAmountMinor)) : "",
    capMajor: editing?.maxDiscountMinor ? String(toMajor(editing.maxDiscountMinor)) : "",
    maxUses: editing?.maxUses ? String(editing.maxUses) : "",
    active: editing?.active ?? true,
  };
}

export interface PromoErrors {
  percent: string | null;
  amount: string | null;
  cap: string | null;
  maxUses: string | null;
}

/** Validation (the server checks the same — this is for a clear message before the request). */
export function promoErrors(v: PromoFormValues): PromoErrors {
  const percentNum = Number(v.percent.replace(",", "."));
  let percent: string | null = null;
  if (v.mode === "percent") {
    if (!v.percent.trim()) percent = "Укажите процент";
    else if (!Number.isInteger(percentNum) || percentNum < 1 || percentNum > 100) percent = "Целое число от 1 до 100";
  }
  const amount =
    v.mode !== "amount" ? null : !v.amountMajor.trim() || toMinor(v.amountMajor) <= 0 ? "Укажите сумму больше 0" : null;
  const cap = v.mode === "percent" && v.capMajor.trim() && toMinor(v.capMajor) <= 0 ? "Сумма больше 0 или пусто" : null;
  const maxUsesNum = Number(v.maxUses);
  const maxUses =
    v.maxUses.trim() && (!Number.isInteger(maxUsesNum) || maxUsesNum < 1) ? "Целое число от 1 или пусто" : null;
  return { percent, amount, cap, maxUses };
}

/** Первая ошибка по порядку полей — для тоста при сохранении. */
export function firstError(e: PromoErrors): string | null {
  return e.percent ?? e.amount ?? e.cap ?? e.maxUses;
}

export function promoBody(v: PromoFormValues): PromoBody {
  const percentNum = Number(v.percent.replace(",", "."));
  return {
    code: v.code.trim().toUpperCase(),
    discountPercent: v.mode === "percent" ? percentNum : null,
    discountAmountMinor: v.mode === "amount" ? toMinor(v.amountMajor) : null,
    maxDiscountMinor: v.mode === "percent" && v.capMajor.trim() ? toMinor(v.capMajor) : 0,
    maxUses: v.maxUses.trim() ? Number(v.maxUses) : null,
    active: v.active,
  };
}

/** Правка уже использованного кода и переименование — для предупреждения в окне. */
export function editWarning(editing: PromoCode | null, code: string): { uses: number; renamed: boolean } {
  return {
    uses: editing ? usesOf(editing) : 0,
    renamed: !!editing && code.trim().toUpperCase() !== editing.code,
  };
}
