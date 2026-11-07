import { dayInZone, nowMs } from "@shop/core/time";
import { toMajor, toMinor } from "@/lib/money";
import { percentOfMinor, usesOf } from "./promo";
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
  /** Последний день действия `yyyy-MM-dd`; пусто — бессрочный. */
  expiresOn: string;
  active: boolean;
}

export const EMPTY_PROMO_FORM: PromoFormValues = {
  code: "",
  mode: "percent",
  percent: "",
  amountMajor: "",
  capMajor: "",
  maxUses: "",
  expiresOn: "",
  active: true,
};

/** Пояс бизнеса: срок кода — до конца этого дня (так считает бэкенд). */
const SHOP_ZONE = "Europe/Kyiv";
const DAY_MS = 24 * 3600_000;

/** Сегодня по Киеву `yyyy-MM-dd`. */
export function shopToday(at: number = nowMs()): string {
  return dayInZone(SHOP_ZONE, new Date(at));
}

/** День срока существующего кода по Киеву; нет срока — пусто. */
export function expiryDay(p: Pick<PromoCode, "expiresAt"> | null): string {
  return p?.expiresAt ? dayInZone(SHOP_ZONE, new Date(p.expiresAt)) : "";
}

/** Дата через `days` суток от сегодня (чипы 7 / 30 / 90 дн.). */
export function expiryAfterDays(days: number, at: number = nowMs()): string {
  return dayInZone(SHOP_ZONE, new Date(at + days * DAY_MS));
}

/** Значения при открытии окна: пустая форма или правка существующего кода. */
export function initialForm(editing: PromoCode | null): PromoFormValues {
  return {
    code: editing?.code ?? "",
    mode: editing?.discountAmountMinor ? "amount" : "percent",
    percent: editing?.discountPercent ? String(editing.discountPercent) : "",
    amountMajor: editing?.discountAmountMinor ? String(toMajor(editing.discountAmountMinor)) : "",
    capMajor: editing?.maxDiscountMinor ? String(toMajor(editing.maxDiscountMinor)) : "",
    maxUses: editing?.maxUses ? String(editing.maxUses) : "",
    expiresOn: expiryDay(editing),
    active: editing?.active ?? true,
  };
}

export interface PromoErrors {
  percent: string | null;
  amount: string | null;
  cap: string | null;
  maxUses: string | null;
  expiresOn: string | null;
}

function percentError(v: PromoFormValues): string | null {
  if (v.mode !== "percent") return null;
  if (!v.percent.trim()) return "Укажите процент";
  const n = Number(v.percent.replace(",", "."));
  return !Number.isInteger(n) || n < 1 || n > 100 ? "Целое число от 1 до 100" : null;
}

function maxUsesError(v: PromoFormValues): string | null {
  const n = Number(v.maxUses);
  return v.maxUses.trim() && (!Number.isInteger(n) || n < 1) ? "Целое число от 1 или пусто" : null;
}

/** A day that already passed is refused, except the one the code already has (an expired code stays editable). */
function expiryError(v: PromoFormValues, initial: string, at: number): string | null {
  return v.expiresOn && v.expiresOn !== initial && v.expiresOn < shopToday(at) ? "Срок в прошлом" : null;
}

/** Validation (the server checks the same — this is for a clear message before the request). */
export function promoErrors(v: PromoFormValues, initialExpiresOn = "", at: number = nowMs()): PromoErrors {
  const amount =
    v.mode !== "amount" ? null : !v.amountMajor.trim() || toMinor(v.amountMajor) <= 0 ? "Укажите сумму больше 0" : null;
  const cap = v.mode === "percent" && v.capMajor.trim() && toMinor(v.capMajor) <= 0 ? "Сумма больше 0 или пусто" : null;
  return {
    percent: percentError(v),
    amount,
    cap,
    maxUses: maxUsesError(v),
    expiresOn: expiryError(v, initialExpiresOn, at),
  };
}

/** Первая ошибка по порядку полей — для тоста при сохранении. */
export function firstError(e: PromoErrors): string | null {
  return e.percent ?? e.amount ?? e.cap ?? e.maxUses ?? e.expiresOn;
}

/** Поля срока тела: дата не менялась — ничего не шлём (срок с временем остаётся как был); стёрли — `noExpiry`. */
function expiryFields(expiresOn: string, initial: string): Pick<PromoBody, "expiresOn" | "noExpiry"> {
  if (expiresOn === initial) return {};
  return expiresOn ? { expiresOn } : { noExpiry: true };
}

export function promoBody(v: PromoFormValues, initialExpiresOn = ""): PromoBody {
  const percentNum = Number(v.percent.replace(",", "."));
  return {
    code: v.code.trim().toUpperCase(),
    discountPercent: v.mode === "percent" ? percentNum : null,
    discountAmountMinor: v.mode === "amount" ? toMinor(v.amountMajor) : null,
    maxDiscountMinor: v.mode === "percent" && v.capMajor.trim() ? toMinor(v.capMajor) : 0,
    maxUses: v.maxUses.trim() ? Number(v.maxUses) : null,
    active: v.active,
    ...expiryFields(v.expiresOn, initialExpiresOn),
  };
}

/** Правка уже использованного кода и переименование — для предупреждения в окне. */
export function editWarning(editing: PromoCode | null, code: string): { uses: number; renamed: boolean } {
  return {
    uses: editing ? usesOf(editing) : 0,
    renamed: !!editing && code.trim().toUpperCase() !== editing.code,
  };
}

/** Чипы-пресеты: ставят и режим, и значение (процент ↔ сумма). */
export const PROMO_PRESETS: { label: string; mode: Mode; value: string }[] = [
  { label: "5 %", mode: "percent", value: "5" },
  { label: "10 %", mode: "percent", value: "10" },
  { label: "15 %", mode: "percent", value: "15" },
  { label: "100 ₴", mode: "amount", value: "100" },
  { label: "200 ₴", mode: "amount", value: "200" },
];

/** Применить пресет к значениям формы. */
export function applyPreset(v: PromoFormValues, p: { mode: Mode; value: string }): PromoFormValues {
  return p.mode === "percent" ? { ...v, mode: "percent", percent: p.value } : { ...v, mode: "amount", amountMajor: p.value };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Случайный код из 8 знаков без похожих символов (0/O, 1/I). `rnd` — для тестов. */
export function randomCode(rnd: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}

/** Пример расчёта для формы: «5 % от 2 000 ₴ = −100 ₴»; пока значения невалидны — null. */
export function exampleOf(v: PromoFormValues, e: PromoErrors, base = 2000_00): { base: number; discountMinor: number } | null {
  if (v.mode === "percent") {
    if (e.percent || e.cap || !v.percent.trim()) return null;
    let d = percentOfMinor(base, Number(v.percent));
    if (v.capMajor.trim()) d = Math.min(d, toMinor(v.capMajor));
    return { base, discountMinor: d };
  }
  if (e.amount || !v.amountMajor.trim()) return null;
  return { base, discountMinor: Math.min(base, toMinor(v.amountMajor)) };
}

/** Тело правки «только активность»: остальные поля — как у кода (без `expiresOn`/`noExpiry` бэкенд срок не трогает, в том числе у кодов из кейса и за отзыв). */
export function toggleBody(p: PromoCode, active: boolean): PromoBody {
  return {
    code: p.code,
    discountPercent: p.discountPercent || null,
    discountAmountMinor: p.discountPercent ? null : p.discountAmountMinor || null,
    maxDiscountMinor: p.maxDiscountMinor ?? 0,
    maxUses: p.maxUses ?? null,
    active,
  };
}
