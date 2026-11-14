/**
 * Окно «Створити / Редагувати / Пересоздать ТТН» без React: форма из предпросмотра, форма → опции API,
 * можно ли сохранять, текст итога.
 */
import { toMajor, toMinor } from "@shop/core/money";
import { cmText, intOrNull, intText, toMm } from "./format";
import type { BoxPreset, ParcelSeat, Shipment, ShipmentOptions, ShipmentPreview } from "./types";

export type ShipmentMode = "create" | "edit" | "remake";

export interface ShipmentForm {
  sender: string;
  weight: string;
  /** Стороны коробки в сантиметрах (API принимает миллиметры). */
  l: string;
  w: string;
  h: string;
  declared: string;
  collectCod: boolean;
  description: string;
  date: string;
  last: string;
  first: string;
  middle: string;
  allowUnpaid: boolean;
  documents: boolean;
  /** Места многоместной ТТН как упаковали: уходят в НП снова как есть (вес и стороны формы тогда не правятся). */
  seats: ParcelSeat[] | null;
}

/** Места уже созданной ТТН, если их два и больше; иначе null — одно место правится полями формы. */
export function existingSeats(p: Pick<ShipmentPreview, "existing">): ParcelSeat[] | null {
  const seats = p.existing?.packing?.seats ?? [];
  // box у места бывает null (своя упаковка без названия) — сервер принимает и так.
  return seats.length > 1 ? seats.map((s) => ({ ...s, box: s.box as string })) : null;
}

/** Правка (не пересоздание) начинает с веса и коробки самой ТТН; предпросмотр считает их по заказу. */
function parcelFields(p: ShipmentPreview, s: Shipment | null | undefined): Pick<ShipmentForm, "weight" | "l" | "w" | "h"> {
  const own: Partial<Shipment> = s ?? {};
  return {
    weight: intText(own.weightG || p.parcel.weightG),
    l: cmText(own.lengthMm || p.parcel.lengthMm),
    w: cmText(own.widthMm || p.parcel.widthMm),
    h: cmText(own.heightMm || p.parcel.heightMm),
  };
}

export function formFrom(p: ShipmentPreview, keepExisting: boolean): ShipmentForm {
  return {
    sender: p.senderWarehouseRef ?? "",
    ...parcelFields(p, keepExisting ? p.existing : null),
    declared: p.declaredMinor ? String(toMajor(p.declaredMinor)) : "",
    collectCod: p.collectCod,
    description: p.description ?? "",
    date: p.date ?? "",
    last: p.recipientLastName ?? "",
    first: p.recipientFirstName ?? "",
    middle: p.recipientMiddleName ?? "",
    allowUnpaid: false,
    documents: !!p.parcel.documents,
    seats: existingSeats(p),
  };
}

export const BOX_ERROR = "Заполните длину, ширину и высоту";

/** Коробка заполнена частично — ошибка; пустая или полная — нет. */
export function boxError(f: Pick<ShipmentForm, "l" | "w" | "h">): string | null {
  const given = [f.l, f.w, f.h].filter((x) => x.trim()).length;
  if (given === 0) return null;
  return given === 3 && toMm(f.l) && toMm(f.w) && toMm(f.h) ? null : BOX_ERROR;
}

const blankToNull = (s: string): string | null => s.trim() || null;

/** Вся форма как опции API (коробка с ошибкой не отправляется). */
export function toOptions(f: ShipmentForm): ShipmentOptions {
  const box = boxError(f) === null;
  const declared = toMinor(f.declared);
  return {
    senderWarehouseRef: f.sender || null,
    weightG: intOrNull(f.weight),
    lengthMm: box ? toMm(f.l) : null,
    widthMm: box ? toMm(f.w) : null,
    heightMm: box ? toMm(f.h) : null,
    declaredMinor: declared > 0 ? declared : null,
    collectCod: f.collectCod,
    description: blankToNull(f.description),
    date: f.date || null,
    recipientLastName: blankToNull(f.last),
    recipientFirstName: blankToNull(f.first),
    recipientMiddleName: blankToNull(f.middle),
    allowUnpaid: f.allowUnpaid,
    documents: f.documents,
    seats: f.seats,
  };
}

/** Заготовка коробки совпадает со сторонами формы. */
export function presetMatches(f: Pick<ShipmentForm, "l" | "w" | "h">, p: BoxPreset): boolean {
  return toMm(f.l) === p.lengthMm && toMm(f.w) === p.widthMm && toMm(f.h) === p.heightMm;
}

/**
 * Вес одних товаров: вес предпросмотра минус тара коробок его мест (коробка места — имя заготовки; место без
 * коробки или с незнакомым именем — без тары). Считается по первому предпросмотру, не по полю формы: при правке
 * поле начинается с веса самой ТТН.
 */
export function goodsWeightG(initial: Pick<ShipmentPreview, "parcel">, presets: BoxPreset[]): number {
  const tare = (initial.parcel.seats ?? []).reduce((sum, s) => sum + (presets.find((p) => p.name === s.box)?.tareG ?? 0), 0);
  return Math.max(0, initial.parcel.weightG - tare);
}

/** Нажали заготовку: стороны этой коробки и вес = товары + её тара (а не тара прежней коробки). */
export function presetPatch(
  initial: Pick<ShipmentPreview, "parcel">,
  presets: BoxPreset[],
  box: BoxPreset,
): Pick<ShipmentForm, "weight" | "l" | "w" | "h"> {
  return {
    weight: intText(goodsWeightG(initial, presets) + box.tareG),
    l: cmText(box.lengthMm),
    w: cmText(box.widthMm),
    h: cmText(box.heightMm),
  };
}

/** «Документи» предлагаем для одного места до 1 кг (или если уже включено). */
export function documentsOffered(f: ShipmentForm, p: ShipmentPreview | null | undefined): boolean {
  return f.documents || ((p?.parcel.seats?.length ?? 1) <= 1 && (intOrNull(f.weight) ?? 0) <= 1000);
}

export interface SubmitState {
  form: ShipmentForm;
  preview: ShipmentPreview | null | undefined;
  mode: ShipmentMode;
  loading: boolean;
  loadError: string | null;
}

/** Создать нельзя: нет предпросмотра, идёт пересчёт, есть проблемы, коробка с ошибкой, неоплачен без галочки, ТТН уже есть. */
export function submitBlocked({ form, preview, mode, loading, loadError }: SubmitState): boolean {
  if (!preview || loading || loadError) return true;
  if (preview.problems.length > 0 || boxError(form)) return true;
  if (mode !== "create") return false;
  return !!preview.existing || (preview.unpaid && !form.allowUnpaid);
}

/** Текст тоста: пересоздание с новым номером, обновление, создание. */
export function successMessage(mode: ShipmentMode, before: string | null | undefined, s: Pick<Shipment, "ttn" | "printedAt">): string {
  if (mode === "create") return `ТТН ${s.ttn} создана`;
  if (before && before !== s.ttn) return `Старая ТТН ${before} удалена, новая — ${s.ttn}. Напечатайте новую этикетку`;
  return `ТТН ${s.ttn} обновлена${s.printedAt ? "" : " — напечатайте этикетку заново, если печатали"}`;
}
