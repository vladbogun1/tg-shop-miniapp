/**
 * Коробки и упаковка без React: подписи размеров, выбор коробки упаковщиком → тело «Упаковано», текст тоста,
 * перемер Новой Почты против нашего, флаги журнала.
 */
import { money } from "@shop/core/money";
import { intOrNull, toMm, weightText } from "./format";
import type { ConfirmBoxBody, ConfirmBoxResult, NpBox, NpBoxEdit, Packing } from "./types";

const CM = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** 285 мм → «28,5». */
export function cm(mm: number): string {
  return CM.format(mm / 10);
}

export function isBagBox(b: Pick<NpBox, "kind" | "heightsMm">): boolean {
  return b.kind === "BAG" || b.heightsMm.length === 0;
}

/**
 * Стандартная ячейка поштомата НП, мм, меньшая сторона первой (60×40×30 см). У конкретного поштомата бывает меньше —
 * это проверит сервер; здесь — чтобы упаковщик не выбирал заведомо не влезающую коробку.
 */
export const POSTOMAT_CELL_MM = [300, 400, 600] as const;

/** Посылка Д×Ш×В влезает в ячейку поштомата (стороны сравниваются по возрастанию — коробку можно положить на бок). */
export function fitsPostomat(l: number, w: number, h: number): boolean {
  const d = [l, w, h].sort((a, b) => a - b);
  return d.every((x, i) => x <= POSTOMAT_CELL_MM[i]);
}

/** Коробка на этой высоте влезает в поштомат; пакет — всегда: сервер сложит его до ячейки, если товар влезает. */
export function boxFitsPostomat(b: Pick<NpBox, "kind" | "lengthMm" | "widthMm" | "heightsMm">, heightMm?: number | null): boolean {
  if (isBagBox(b)) return true;
  const heights = heightMm != null ? [heightMm] : b.heightsMm;
  return heights.some((h) => fitsPostomat(b.lengthMm, b.widthMm, h));
}

/** «40×24 · высота 20/13/8» или «36×25 · пакет». */
export function boxSizeText(b: Pick<NpBox, "kind" | "lengthMm" | "widthMm" | "heightsMm">): string {
  const sides = `${cm(b.lengthMm)}×${cm(b.widthMm)}`;
  return isBagBox(b) ? `${sides} · пакет` : `${sides} · высота ${b.heightsMm.map(cm).join("/")}`;
}

export interface OwnBoxForm {
  name: string;
  l: string;
  w: string;
  h: string;
  /** Линии сгиба ниже полной высоты, см через запятую или пробел: «13 8» / «13; 8,5». */
  folds: string;
}

export const EMPTY_OWN_BOX: OwnBoxForm = { name: "", l: "", w: "", h: "", folds: "" };

/**
 * Своя коробка → тело POST /boxes (мм; высоты по убыванию, полная первая, без повторов и не выше полной);
 * null — нет имени или сторон.
 */
export function ownBoxBody(f: OwnBoxForm): NpBoxEdit | null {
  const [lengthMm, widthMm, full] = [toMm(f.l), toMm(f.w), toMm(f.h)];
  const name = f.name.trim();
  if (!name || !lengthMm || !widthMm || !full) return null;
  const folds = f.folds
    .split(/[\s;]+/)
    .map((x) => toMm(x.replace(/,$/, "")))
    .filter((x): x is number => x != null && x < full);
  const heightsMm = [full, ...Array.from(new Set(folds)).sort((a, b) => b - a)];
  return { name, kind: "BOX", lengthMm, widthMm, heightsMm, inStock: true };
}

/** Что выбрал упаковщик: коробку из списка (высота — линия сгиба; null — полная / у пакета) или свои размеры. */
export type PackChoice =
  | { kind: "box"; boxId: string; heightMm: number | null }
  | { kind: "custom"; name: string; l: string; w: string; h: string; save: boolean; bag?: boolean };

/** Коробка и высота по подписи «Коробка 5 кг · 13 см» (так сервер пишет совет); пакет — по имени. */
export function choiceByLabel(boxes: NpBox[], label: string | null | undefined): Extract<PackChoice, { kind: "box" }> | null {
  if (!label) return null;
  for (const b of boxes) {
    if (isBagBox(b) && b.name === label) return { kind: "box", boxId: b.id, heightMm: null };
    const o = b.options.find((x) => x.label === label);
    if (o) return { kind: "box", boxId: b.id, heightMm: o.heightMm };
  }
  return null;
}

/** Подпись выбранного: «Коробка 5 кг · 13 см» / «Своя коробка 40×24×9,5 см». */
export function choiceLabel(boxes: NpBox[], c: PackChoice | null): string {
  if (!c) return "—";
  if (c.kind === "custom") {
    const sides = (c.bag ? [c.l, c.w] : [c.l, c.w, c.h]).map((x) => toMm(x));
    const size = sides.every(Boolean) ? ` ${sides.map((x) => cm(x as number)).join("×")} см` : "";
    return `${c.name.trim() || (c.bag ? "Свой пакет" : "Своя коробка")}${size}`;
  }
  const b = boxes.find((x) => x.id === c.boxId);
  if (!b) return "—";
  return b.options.find((o) => o.heightMm === c.heightMm)?.label ?? b.name;
}

/**
 * Тело POST …/box; null — свои размеры заполнены не полностью. Пустой вес — сервер считает товары + тару.
 * `thickness` — место из нескольких: у своего пакета (стрейч на коврике) толщина вписана, а не «по всем товарам».
 */
export function confirmBody(c: PackChoice, weight: string, thickness = false): ConfirmBoxBody | null {
  const weightG = intOrNull(weight) ?? undefined;
  if (c.kind === "box") return { boxId: c.boxId, heightMm: c.heightMm ?? undefined, weightG };
  const [lengthMm, widthMm, heightMm] = [toMm(c.l), toMm(c.w), toMm(c.h)];
  // Свой пакет: длина и ширина — толщину сервер считает по товару, как у «Пакета НП» (или берёт вписанную).
  if (c.bag) {
    if (!lengthMm || !widthMm) return null;
    const own = thickness && heightMm ? heightMm : undefined;
    return { custom: { name: c.name.trim() || undefined, lengthMm, widthMm, heightMm: own, saveAsBox: c.save, bag: true }, weightG };
  }
  if (!lengthMm || !widthMm || !heightMm) return null;
  return { custom: { name: c.name.trim() || undefined, lengthMm, widthMm, heightMm, saveAsBox: c.save }, weightG };
}

/** Ещё одно место посылки (коврик в стрейче отдельно от мышки в коробке): своя коробка и вес. */
export interface PackPlace {
  choice: PackChoice | null;
  weight: string;
}

/**
 * Тело «Упаковано» на несколько мест одной ТТН: первое — выбор над списком, остальные — добавленные;
 * null — у какого-то места не выбрана коробка или не дописаны размеры.
 */
export function placesBody(first: PackChoice, firstWeight: string, more: PackPlace[]): ConfirmBoxBody | null {
  const all = [{ choice: first, weight: firstWeight }, ...more].map((p) => (p.choice ? confirmBody(p.choice, p.weight, true) : null));
  if (all.some((b) => !b)) return null;
  return { places: all.map((b) => ({ boxId: b?.boxId, heightMm: b?.heightMm, custom: b?.custom, weightG: b?.weightG })) };
}

/** Тело «Упаковано»: одно место или несколько (`more` — места после первого); null — выбрано не всё. */
export function packBody(first: PackChoice | null, weight: string, more: PackPlace[]): ConfirmBoxBody | null {
  if (!first) return null;
  return more.length > 0 ? placesBody(first, weight, more) : confirmBody(first, weight);
}

/** «2 места», «5 мест». */
export function placesWord(n: number): string {
  const [tens, last] = [n % 100, n % 10];
  if ((tens >= 11 && tens <= 14) || last === 0 || last >= 5) return `${n} мест`;
  return last === 1 ? `${n} место` : `${n} места`;
}

/** Новая Почта уже приняла посылку (код статуса ≥ 4): ТТН не меняется, коробка только записывается. */
export function npHasParcel(statusCode: string | null | undefined): boolean {
  const n = Number(statusCode);
  return Number.isFinite(n) && n >= 4;
}

/** Печать этикетки без подтверждённой коробки: НП перемеряет посылку в отделении. */
export const UNCONFIRMED_PRINT = {
  title: "Сначала подтвердите коробку?",
  message: "Коробка не подтверждена: в ТТН может быть не та коробка, и Новая Почта перемеряет посылку в отделении. После «Упаковано» ТТН обновится.",
  confirmLabel: "Печатать всё равно",
  cancelLabel: "Подтвердить сначала",
};

/** Тост после «Упаковано». */
export function confirmMessage(
  r: Pick<ConfirmBoxResult, "ttnUpdated" | "ttnNumberChanged"> & { ttnCreated?: boolean; shipment: { ttn: string } },
  before: string | null | undefined,
): string {
  if (r.ttnCreated) return `Упаковано, ТТН №${r.shipment.ttn} создана — можно печатать этикетку`;
  if (r.ttnNumberChanged) {
    return before ? `Коробка подтверждена, ТТН №${before} заменена на №${r.shipment.ttn}` : `Коробка подтверждена, новая ТТН №${r.shipment.ttn}`;
  }
  if (r.ttnUpdated) return "Коробка подтверждена, ТТН обновлена";
  return "Коробка записана, ТТН не менялась";
}

/** NP's volumetric divisor: Д×Ш×В мм³ / 4000 = г. */
const VOLUME_DIVISOR = 4000;
/** «Перемерила иначе»: вес или цена отличаются больше чем на эту долю. */
export const REMEASURE_SHARE = 0.15;

export interface Declared {
  weightG?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  deliveryCostMinor?: number | null;
  /** Места многоместной ТТН (два и больше); null — одно место по полям выше. */
  seats?: { weightG: number; lengthMm: number; widthMm: number; heightMm: number }[] | null;
}

const volumeG = (l: number, w: number, h: number): number => Math.round((l * w * h) / VOLUME_DIVISOR);

/**
 * Наш платный вес: больший из заявленного и объёмного по нашим сторонам. Несколько мест: НП считает каждое место
 * отдельно (два места по 90 ₴ — 180 ₴), так что у каждого свой больший вес, и они складываются.
 */
export function declaredChargeableG(d: Declared): number | null {
  if (d.seats && d.seats.length > 1) {
    return d.seats.reduce((sum, s) => sum + Math.max(s.weightG, volumeG(s.lengthMm, s.widthMm, s.heightMm)), 0);
  }
  const w = d.weightG ?? null;
  if (!d.lengthMm || !d.widthMm || !d.heightMm) return w;
  return Math.max(w ?? 0, volumeG(d.lengthMm, d.widthMm, d.heightMm));
}

const off = (a: number | null | undefined, b: number | null | undefined): boolean =>
  a != null && b != null && b > 0 && Math.abs(a - b) > b * REMEASURE_SHARE;

export interface Remeasure {
  text: string;
  /** Вес или цена НП отличаются от наших больше чем на 15 %. */
  differs: boolean;
}

type NpMeasure = Pick<Packing, "npWeightG" | "npVolumeWeightG" | "npFactualWeightG" | "npCostMinor" | "npMeasuredAt">;

/** «НП перемеряла: 5 кг (объёмный), 195,50 ₴ — у нас было 1,9 кг, 110,50 ₴»; null — НП ещё не мерила. */
export function remeasureText(np: NpMeasure, ours: Declared): Remeasure | null {
  if (!np.npMeasuredAt || np.npWeightG == null) return null;
  const volumetric = np.npVolumeWeightG != null && np.npVolumeWeightG >= (np.npFactualWeightG ?? 0) && np.npVolumeWeightG > 0;
  const theirs = [`${weightText(np.npWeightG)}${volumetric ? " (объёмный)" : ""}`];
  if (np.npCostMinor != null) theirs.push(money(np.npCostMinor));
  const mine: string[] = [];
  const ourWeight = declaredChargeableG(ours);
  if (ourWeight != null) mine.push(weightText(ourWeight));
  if (ours.deliveryCostMinor != null) mine.push(money(ours.deliveryCostMinor));
  const text = `НП перемеряла: ${theirs.join(", ")}${mine.length ? ` — у нас было ${mine.join(", ")}` : ""}`;
  return { text, differs: off(np.npWeightG, ourWeight) || off(np.npCostMinor, ours.deliveryCostMinor) };
}
