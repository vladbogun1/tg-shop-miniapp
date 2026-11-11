import { formatNumber, toMajor } from "@shop/core/money";
import { toPercent } from "@shop/core/percent";
import { fmtDay } from "./batch";
import type { BatchLineOption, Lot, LotSourceRequest } from "./types";

/**
 * «Склад по партиям» в карточке товара: из каких партий штуки на складе, во что обошлась штука
 * (закупка + доставка = себестоимость) и какая маржа при цене товара. Чистые расчёты, без React —
 * их делят быстрый просмотр и шаг «Цена и склад».
 */

/** Цвета поставок на полосе состава, по порядку продажи. Старый / ручной остаток — серая штриховка (`color: null`). */
const BATCH_COLORS = ["#FF6600", "#FFB27A", "#C2410C", "#FDBA74", "#EA580C", "#FED7AA"];

export interface ShelfLot extends Lot {
  /** Цвет поставки; null — старый остаток или добавленные руками штуки. */
  color: string | null;
  /** Следующая проданная штука уйдёт отсюда (FIFO считается внутри варианта). */
  next: boolean;
}

/** Партии с остатком в порядке продажи (бэкенд уже отдаёт FIFO): цвет на полосе и метка «продаются первыми». */
export function shelfLots(lots: Lot[]): ShelfLot[] {
  const colorOf = new Map<number, string>();
  const seen = new Set<string>();
  return lots
    .filter((l) => l.qtyLeft > 0)
    .map((l) => {
      let color: string | null = null;
      if (l.kind === "BATCH" && l.batchId != null) {
        if (!colorOf.has(l.batchId)) colorOf.set(l.batchId, BATCH_COLORS[colorOf.size % BATCH_COLORS.length] ?? BATCH_COLORS[0]);
        color = colorOf.get(l.batchId) ?? null;
      }
      const line = l.variantId ?? "";
      const next = !seen.has(line);
      seen.add(line);
      return { ...l, color, next };
    });
}

export interface StockSummary {
  units: number;
  /** Штук с известной себестоимостью — по ним и считаются средние. */
  knownUnits: number;
  unknownUnits: number;
  /** Себестоимость всех известных штук. */
  costMinor: number;
  avgCostMinor: number | null;
  avgMarginMinor: number | null;
  /** Маржа к цене, %. */
  marginPct: number | null;
  /** Наценка к себестоимости, %. */
  markupPct: number | null;
  /** Прибыль, если продать все известные штуки по текущей цене. */
  profitMinor: number | null;
}

export function stockSummary(lots: Pick<Lot, "qtyLeft" | "unitCostMinor">[], priceMinor: number): StockSummary {
  let units = 0;
  let known = 0;
  let cost = 0;
  for (const l of lots) {
    if (l.qtyLeft <= 0) continue;
    units += l.qtyLeft;
    if (l.unitCostMinor == null) continue;
    known += l.qtyLeft;
    cost += l.qtyLeft * l.unitCostMinor;
  }
  const avg = known > 0 ? Math.round(cost / known) : null;
  const m = avg == null ? null : lotMargin(avg, priceMinor);
  return {
    units,
    knownUnits: known,
    unknownUnits: units - known,
    costMinor: cost,
    avgCostMinor: avg,
    avgMarginMinor: m?.minor ?? null,
    marginPct: m?.pct ?? null,
    markupPct: m == null || avg == null || avg <= 0 ? null : toPercent(m.minor / avg),
    profitMinor: known > 0 && priceMinor > 0 ? priceMinor * known - cost : null,
  };
}

/** Маржа штуки при цене: деньгами и в % от цены; нет цены или себестоимости — null. */
export function lotMargin(costMinor: number | null | undefined, priceMinor: number): { minor: number; pct: number } | null {
  if (costMinor == null || priceMinor <= 0) return null;
  const minor = priceMinor - costMinor;
  return { minor, pct: toPercent(minor / priceMinor) };
}

const SYMBOL: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", PLN: "zł " };
const num = (n: number) => formatNumber(n, "ru-RU", { maximumFractionDigits: 2 });

/** Закупка в валюте поставки: «¥178 × 5,83». Гривны, нет цены или валюты — null. */
export function fxLine(l: Pick<Lot, "currency" | "unitPriceFx" | "fxRate">): string | null {
  if (l.unitPriceFx == null || !l.currency || l.currency === "UAH") return null;
  const price = `${SYMBOL[l.currency] ?? `${l.currency} `}${num(toMajor(l.unitPriceFx))}`;
  return l.fxRate ? `${price} × ${num(l.fxRate)}` : price;
}

/** Момент → «9 ноября» по местному календарю (год — если не текущий). */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return fmtDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

/** «Поставка №4» — короткое имя партии; старый и ручной остаток — по виду. */
export function lotName(l: Pick<Lot, "kind" | "batchId">): string {
  if (l.kind === "BATCH") return l.batchId != null ? `Поставка №${l.batchId}` : "Поставка";
  return l.kind === "OPENING" ? "Старый остаток" : "Добавлены вручную";
}

/** Строка поставки в выборе «Из поставки»: «Поставка №4 · Zpmax · 11 ноября · приехало 10, на складе 5». */
export function batchLineLabel(b: BatchLineOption): string {
  return [
    `Поставка №${b.batchId}`,
    b.batchTitle,
    b.variantName,
    dayOf(b.arrivedAt),
    `приехало ${b.qtyArrived}, на складе ${b.onLots}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Строки поставок одного варианта (null — товар без вариантов). */
export function batchLinesOf(lines: BatchLineOption[], variantId: string | null): BatchLineOption[] {
  return lines.filter((b) => (b.variantId ?? null) === variantId);
}

// ---- «Откуда +N шт?» ----------------------------------------------------------------------------

/**
 * Ответ на «откуда штуки»: новое поступление (по умолчанию: штуки встают в конец очереди и продаются последними,
 * закупка — по желанию), из приехавшей поставки, старый / неучтённый остаток с закупкой за штуку (продаётся первым)
 * или «другое» с пояснением. Суммы — копейки.
 */
export type LotSourceAnswer =
  | { kind: "BATCH"; batchItemId: number }
  | { kind: "NEW" | "OLD" | "OTHER"; purchaseMinor: number | null; extraMinor: number | null; note: string };

/** Не ответили — значит, новое поступление без закупки. */
export const DEFAULT_LOT_SOURCE: LotSourceAnswer = { kind: "NEW", purchaseMinor: null, extraMinor: null, note: "" };

/**
 * Строка склада, где форма добавила штуки: сам товар (без вариантов) или один вариант. `key` — по нему редактор
 * хранит ответ; `variantId` null — товар без вариантов или вариант, которого ещё нет на сервере (id станет известен
 * после сохранения, ищется по `name`).
 */
export interface LotRaise {
  key: string;
  variantId: string | null;
  name: string | null;
  units: number;
}

/** «+3 шт · Чёрный» — для заголовков и тостов. */
export function raiseLabel(r: Pick<LotRaise, "units" | "name">): string {
  return `+${r.units} шт${r.name ? ` · ${r.name}` : ""}`;
}

const SOURCE_NOTE: Record<"NEW" | "OLD" | "OTHER", string> = { NEW: "новое поступление", OLD: "старый остаток", OTHER: "" };

/** Пояснение в журнал; у старого остатка его пишет сервер («старый остаток, закупка …»). */
const JOURNAL_NOTE: Record<"NEW" | "OLD" | "OTHER", string> = { ...SOURCE_NOTE, OLD: "" };

/**
 * Тело `lot-source` для `qty` штук; null — отправлять нечего (без закупки штуки так и останутся новой партией
 * «без закупки» в конце очереди — ровно это и делает сохранение товара).
 */
export function lotSourceRequest(a: LotSourceAnswer, qty: number, variantId: string | null): LotSourceRequest | null {
  const variant = variantId ?? undefined;
  if (a.kind === "BATCH") return { source: "BATCH", qty, batchItemId: a.batchItemId, variantId: variant };
  if (a.purchaseMinor == null) return null;
  const note = a.note.trim() || JOURNAL_NOTE[a.kind];
  // Старый остаток — отдельный источник: сервер делает из штук «старый остаток», он продаётся первым.
  return { source: a.kind === "OLD" ? "OLD" : "PRICE", qty, purchaseMinor: a.purchaseMinor, extraMinor: a.extraMinor ?? undefined, note: note || undefined, variantId: variant };
}

/** Что не так с ответом (кнопка «Добавить» неактивна, подсказка рядом); null — можно. */
export function lotSourceProblem(a: LotSourceAnswer | null): string | null {
  if (!a) return "Выберите, откуда штуки";
  if (a.kind === "OLD" && a.purchaseMinor == null) return "Впишите закупку за штуку";
  if (a.kind === "OTHER" && !a.note.trim()) return "Напишите, откуда они";
  if (a.kind !== "BATCH" && ((a.purchaseMinor ?? 0) < 0 || (a.extraMinor ?? 0) < 0)) return "Суммы не могут быть меньше нуля";
  return null;
}

/** Себестоимость штуки по ответу: у поставки — её, у вписанной закупки — закупка + доставка. */
export function answerCost(a: LotSourceAnswer, lines: BatchLineOption[]): number | null {
  if (a.kind === "BATCH") return lines.find((b) => b.batchItemId === a.batchItemId)?.costUnitMinor ?? null;
  return a.purchaseMinor == null ? null : a.purchaseMinor + (a.extraMinor ?? 0);
}

/** «+5 шт из поставки №4» / «+5 шт · старый остаток» / «+2 шт · другое: пересорт» — свёрнутый ответ. */
export function lotSourceSummary(a: LotSourceAnswer, qty: number, lines: BatchLineOption[]): string {
  if (a.kind === "BATCH") {
    const b = lines.find((l) => l.batchItemId === a.batchItemId);
    return `+${qty} шт из поставки №${b?.batchId ?? "?"}`;
  }
  const what = a.kind === "OTHER" ? `другое: ${a.note.trim()}` : SOURCE_NOTE[a.kind];
  return `+${qty} шт · ${what}${a.purchaseMinor == null ? " · без закупки" : ""}`;
}

/** «45,5%» — как в метриках; null — «—». Своя копия: модуль аналитики сам зависит от закупки (иначе цикл). */
export function pctText(n: number | null | undefined): string {
  return n == null ? "—" : `${formatNumber(n, "ru-RU", { maximumFractionDigits: 1 })}%`;
}
