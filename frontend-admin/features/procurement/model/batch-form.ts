import { fxToInput, inputToFx, isoInDays, weeksUntil } from "./batch";
import type { Batch, BatchRequest, Distribution, EtaMode } from "./types";

/** Позиция для новой поставки («Заказать у завода»). */
export interface SeedLine {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  qty?: number;
  /** Закупочная цена за штуку в валюте поставки («Поставка с ИИ»). */
  price?: number | null;
}

/** Готовые поля новой поставки («Поставка с ИИ»): название, поставщик, заметка, валюта, курс. */
export type BatchPreset = Partial<Pick<BatchFormValues, "title" | "supplierId" | "privateNote" | "currency" | "fxRate">>;

/** Товар из выбора: ровно то, что форме нужно от товара (без зависимости от фичи «товар»). */
export interface PickedProduct {
  id: string;
  title: string;
  images?: { url?: string | null }[] | null;
  variants?: { id?: string | null; name: string; stock: number }[] | null;
}

export interface FormLine {
  key: string;
  id: number | null;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  qty: string;
  price: string;
}

export interface BatchFormValues {
  title: string;
  supplierId: string;
  privateNote: string;
  publicNote: string;
  etaMode: EtaMode;
  etaFrom: string;
  etaTo: string;
  weeks: string;
  holdHours: string;
  distribution: Distribution;
  preorderOpen: boolean;
  currency: string;
  fxRate: string;
  lines: FormLine[];
}

let seq = 0;
export const newLineKey = () => `l${++seq}`;

export function seedToLine(s: SeedLine): FormLine {
  return {
    key: newLineKey(),
    id: null,
    productId: s.productId,
    variantId: s.variantId,
    title: s.title,
    variantName: s.variantName,
    imageUrl: s.imageUrl,
    qty: String(s.qty ?? 1),
    price: s.price != null ? String(s.price) : "",
  };
}

/** Начальные значения: правка поставки или пустая форма с позициями из `seed`. */
export function initialValues(
  batch: Batch | null | undefined,
  seed: SeedLine[] | undefined,
  defHold: number,
  preset?: BatchPreset,
): BatchFormValues {
  if (!batch) {
    return {
      title: "", supplierId: "", privateNote: "", publicNote: "", etaMode: "APPROX", etaFrom: "", etaTo: "", weeks: "3",
      holdHours: String(defHold), distribution: "QUEUE_HOLD", preorderOpen: true, currency: "USD", fxRate: "",
      ...preset,
      lines: (seed ?? []).map(seedToLine),
    };
  }
  const lines: FormLine[] = batch.items.map((i) => ({
    key: newLineKey(),
    id: i.id,
    productId: i.productId,
    variantId: i.variantId,
    title: i.title,
    variantName: i.variantName,
    imageUrl: i.imageUrl,
    qty: String(i.qtyOrdered),
    price: fxToInput(i.unitPriceFx),
  }));
  return {
    title: batch.title,
    supplierId: batch.supplierId != null ? String(batch.supplierId) : "",
    privateNote: batch.privateNote ?? "",
    publicNote: batch.publicNote ?? "",
    etaMode: batch.etaMode,
    etaFrom: batch.etaMode === "APPROX" ? "" : batch.etaFrom ?? "",
    etaTo: batch.etaTo ?? "",
    weeks: String(Math.max(1, weeksUntil(batch.etaTo)) || 3),
    holdHours: String(batch.holdHours),
    distribution: batch.distribution,
    preorderOpen: batch.preorderOpen,
    currency: batch.currency ?? "USD",
    fxRate: batch.fxRate != null ? String(batch.fxRate) : "",
    lines,
  };
}

/** «Добавить в открытую поставку»: новые позиции в конец, без повторов. */
export function extraSeedLines(batch: Batch, seed: SeedLine[] | undefined): FormLine[] {
  return (seed ?? [])
    .filter((x) => !batch.items.some((i) => i.productId === x.productId && (i.variantId ?? null) === (x.variantId ?? null)))
    .map(seedToLine);
}

export function approxDate(weeks: string): string {
  return isoInDays(Math.max(0, Number(weeks) || 0) * 7);
}

const parseFx = (s: string) => Number(s.replace(",", "."));

/** Ошибка срока поставки или null. */
function etaError(v: BatchFormValues): string | null {
  if (v.etaMode === "DATE" && !v.etaFrom) return "Укажите дату";
  if (v.etaMode === "RANGE" && (!v.etaFrom || !v.etaTo || v.etaTo < v.etaFrom)) return "Диапазон: «с» не позже «по»";
  if (v.etaMode === "APPROX" && !intIn(v.weeks, 1, 52)) return "Через сколько недель приедет — целое число от 1 до 52";
  return null;
}

/** Строка — целое в [min, max]. Пустое поле — не 0, а ошибка. */
function intIn(s: string, min: number, max: number): boolean {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return false;
  const n = Number(t);
  return n >= min && n <= max;
}

/** Сервер: до 100 000 шт на позицию, бронь 1–168 ч, цена закупки — до 10 млн за штуку. */
export const MAX_QTY = 100_000;
export const MAX_HOLD_HOURS = 168;
const MAX_UNIT_PRICE = 10_000_000;

function priceError(price: string): string | null {
  if (!price.trim()) return null;
  const n = Number(price.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= MAX_UNIT_PRICE ? null : "Цена закупки — число от 0 до 10 000 000";
}

/** Текст первой ошибки или null. */
export function validateBatchForm(v: BatchFormValues, itemsLocked: boolean, money: boolean): string | null {
  if (!itemsLocked && v.lines.length === 0) return "Добавьте хотя бы одну позицию";
  if (!itemsLocked && v.lines.some((l) => !intIn(l.qty, 1, MAX_QTY))) return "Сколько заказано — целое число от 1 до 100 000 у каждой позиции";
  const eta = etaError(v);
  if (eta) return eta;
  if (v.distribution === "QUEUE_HOLD" && !intIn(v.holdHours, 1, MAX_HOLD_HOURS)) return "Бронь — от 1 до 168 часов";
  if (money && v.fxRate.trim() && !(parseFx(v.fxRate) > 0 && parseFx(v.fxRate) <= 10_000)) return "Курс — больше нуля и не больше 10 000";
  if (money && !itemsLocked) {
    const bad = v.lines.map((l) => priceError(l.price)).find(Boolean);
    if (bad) return bad;
  }
  return null;
}

export function toBatchRequest(v: BatchFormValues, opts: { money: boolean; itemsLocked: boolean; defHold: number }): BatchRequest {
  const mode = v.etaMode;
  return {
    title: v.title.trim(),
    supplierId: v.supplierId ? Number(v.supplierId) : null,
    privateNote: v.privateNote.trim() || null,
    publicNote: v.publicNote.trim() || null,
    etaMode: mode,
    etaFrom: mode === "DATE" || mode === "RANGE" ? v.etaFrom || null : null,
    etaTo: mode === "RANGE" ? v.etaTo || null : mode === "APPROX" ? approxDate(v.weeks) : null,
    holdHours: Number(v.holdHours) || opts.defHold,
    distribution: v.distribution,
    preorderOpen: v.preorderOpen,
    ...(opts.money ? { currency: v.currency, fxRate: v.fxRate.trim() ? parseFx(v.fxRate) : null } : {}),
    ...(opts.itemsLocked
      ? {}
      : {
          items: v.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            variantId: l.variantId,
            qtyOrdered: Number(l.qty) || 0,
            unitPriceFx: opts.money ? inputToFx(l.price) : null,
          })),
        }),
  };
}
