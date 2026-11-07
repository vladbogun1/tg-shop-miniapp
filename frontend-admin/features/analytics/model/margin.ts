/** Расчёты вкладки «Маржа»: водопад «Откуда прибыль», «Где теряю», сортировка строк. Деньги — копейки. */
import { toPercent } from "@shop/core/percent";
import type { MarginReport, MarginRow } from "./types";

export type BarTone = "base" | "minus" | "profit" | "loss";

export interface WaterfallBar {
  key: "known" | "cost" | "fee" | "profit";
  label: string;
  /** Со знаком: вычитаемое — отрицательное. */
  valueMinor: number;
  /** Положение и ширина на общей шкале 0…100 % от «выручки с известной себестоимостью». */
  leftPct: number;
  widthPct: number;
  tone: BarTone;
  note?: string;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Водопад ровно по формуле «Прибыли» системы: выручка с известной себестоимостью − себестоимость −
 * комиссии = прибыль. Подарки уже внутри себестоимости (показаны пояснением, не вычитаются второй раз),
 * скидки уже внутри выручки. Выручка без себестоимости вне формулы — её показывает вызывающий отдельно.
 */
export function waterfallBars(r: MarginReport): WaterfallBar[] {
  const known = r.knownRevenueMinor;
  const scale = known > 0 ? known : 1;
  const pctOf = (v: number) => clamp(toPercent(v / scale));
  const afterCost = known - r.costMinor;
  const afterFee = afterCost - r.feeMinor;
  const costLeft = pctOf(Math.max(0, afterCost));
  const feeLeft = pctOf(Math.max(0, afterFee));
  return [
    { key: "known", label: "Выручка с известной себестоимостью", valueMinor: known, leftPct: 0, widthPct: 100, tone: "base" },
    {
      key: "cost",
      label: "Себестоимость",
      valueMinor: -r.costMinor,
      leftPct: costLeft,
      widthPct: Math.min(pctOf(r.costMinor), 100 - costLeft),
      tone: "minus",
      note: r.giftsCostMinor > 0 ? "в том числе подарки" : undefined,
    },
    {
      key: "fee",
      label: "Комиссии эквайринга",
      valueMinor: -r.feeMinor,
      leftPct: feeLeft,
      widthPct: Math.min(pctOf(r.feeMinor), 100 - feeLeft),
      tone: "minus",
    },
    {
      key: "profit",
      label: "Прибыль",
      valueMinor: r.profitMinor,
      leftPct: 0,
      widthPct: pctOf(Math.max(0, r.profitMinor)),
      tone: r.profitMinor < 0 ? "loss" : "profit",
    },
  ];
}

export type MarginSort = "default" | "profit" | "revenue" | "margin";

export function sortRows(rows: MarginRow[], by: MarginSort): MarginRow[] {
  if (by === "default") return rows;
  const copy = [...rows];
  if (by === "profit") copy.sort((a, b) => b.profitMinor - a.profitMinor);
  else if (by === "revenue") copy.sort((a, b) => b.revenueMinor - a.revenueMinor);
  else copy.sort((a, b) => a.marginPct - b.marginPct);
  return copy;
}

/** «Где теряю»: убыточные строки (самые большие потери первыми) и самые тонкие положительные маржи. */
export function losingRows(rows: MarginRow[], limit = 5): { loss: MarginRow[]; thin: MarginRow[] } {
  const sold = rows.filter((x) => x.revenueMinor > 0);
  const loss = sold.filter((x) => x.profitMinor < 0).sort((a, b) => a.profitMinor - b.profitMinor).slice(0, limit);
  const thin = sold
    .filter((x) => x.profitMinor >= 0)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, limit);
  return { loss, thin };
}
