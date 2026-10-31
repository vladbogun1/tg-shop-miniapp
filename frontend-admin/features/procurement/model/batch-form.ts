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
}

/** Товар из выбора: ровно то, что форме нужно от товара (без зависимости от фичи «товар»). */
export interface PickedProduct {
  id: string;
  title: string;
  images?: { url: string }[] | null;
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
    price: "",
  };
}

/** Начальные значения: правка поставки или пустая форма с позициями из `seed`. */
export function initialValues(batch: Batch | null | undefined, seed: SeedLine[] | undefined, defHold: number): BatchFormValues {
  if (!batch) {
    return {
      title: "", supplierId: "", privateNote: "", publicNote: "", etaMode: "APPROX", etaFrom: "", etaTo: "", weeks: "3",
      holdHours: String(defHold), distribution: "QUEUE_HOLD", preorderOpen: true, currency: "USD", fxRate: "",
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

/** Текст первой ошибки или null. */
export function validateBatchForm(v: BatchFormValues, itemsLocked: boolean, money: boolean): string | null {
  if (!itemsLocked && v.lines.length === 0) return "Добавьте хотя бы одну позицию";
  if (!itemsLocked && v.lines.some((l) => !(Number(l.qty) >= 1))) return "Сколько заказано — от 1 у каждой позиции";
  if (v.etaMode === "DATE" && !v.etaFrom) return "Укажите дату";
  if (v.etaMode === "RANGE" && (!v.etaFrom || !v.etaTo || v.etaTo < v.etaFrom)) return "Диапазон: «с» не позже «по»";
  if (v.etaMode === "APPROX" && !(Number(v.weeks) >= 0)) return "Укажите, через сколько недель";
  if (money && v.fxRate.trim() && !(parseFx(v.fxRate) > 0)) return "Курс должен быть больше нуля";
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
