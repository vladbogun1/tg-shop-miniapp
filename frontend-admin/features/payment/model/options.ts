import { toMajor, toMinor } from "@/lib/money";
import type { PaymentOptionWrite } from "../api";
import type { PaymentOptionFull } from "./types";

/** Строка формы «Способы оплаты». */
export interface OptionRow {
  /** Стабильный ключ React, пока строки двигаются (у новых нет id). */
  key: string;
  id?: string;
  title: string;
  description: string;
  requiresPrepayment: boolean;
  prepaymentMajor: string;
  active: boolean;
}

let rowSeq = 0;

export function newRowKey(): string {
  return `new-${rowSeq++}`;
}

export function newRow(): OptionRow {
  return { key: newRowKey(), title: "", description: "", requiresPrepayment: false, prepaymentMajor: "", active: true };
}

export function toRows(list: PaymentOptionFull[]): OptionRow[] {
  return list.map((o) => ({
    key: o.id ?? newRowKey(),
    id: o.id,
    title: o.title ?? "",
    description: o.description ?? "",
    requiresPrepayment: !!o.requiresPrepayment,
    prepaymentMajor: o.prepaymentMinor ? String(toMajor(o.prepaymentMinor)) : "",
    active: o.active !== false,
  }));
}

/** Сравнимый вид (без ключей React) для проверки «есть несохранённое». */
export function optionsSnapshot(rows: OptionRow[]): string {
  return JSON.stringify(rows.map((r) => [r.id, r.title, r.description, r.requiresPrepayment, r.prepaymentMajor, r.active]));
}

/** Предоплата в копейках; 0, если пусто или не положительное число. */
export function prepayMinor(o: OptionRow): number {
  const raw = o.prepaymentMajor.trim().replace(",", ".");
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? toMinor(raw) : 0;
}

/** Почему нельзя сохранить (текст для человека) или null. */
export function saveBlocker(options: OptionRow[], loaded: boolean): string | null {
  const named = options.filter((o) => o.title.trim());
  const activeCount = named.filter((o) => o.active).length;
  const blankTitles = options.some((o) => !o.title.trim() && (o.description.trim() || o.id));
  const noPrepayAmount = named.some((o) => o.requiresPrepayment && prepayMinor(o) <= 0);
  if (!loaded) return "Настройки не загружены";
  if (activeCount === 0) return "Включите хотя бы один способ оплаты — иначе покупатели не смогут оформить заказ";
  if (blankTitles) return "У каждого способа оплаты должно быть название";
  if (noPrepayAmount) return "Укажите сумму предоплаты — её покупатель оплатит онлайн";
  return null;
}

/** Тело PUT: только строки с названием, в порядке списка. */
export function toPayload(options: OptionRow[]): PaymentOptionWrite[] {
  return options
    .filter((o) => o.title.trim())
    .map((o) => ({
      id: o.id,
      title: o.title.trim(),
      description: o.description.trim() || undefined,
      requiresPrepayment: o.requiresPrepayment,
      prepaymentMinor: o.requiresPrepayment ? prepayMinor(o) : null,
      active: o.active,
    }));
}

export function moveRow(rows: OptionRow[], key: string, delta: -1 | 1): OptionRow[] {
  const i = rows.findIndex((o) => o.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
