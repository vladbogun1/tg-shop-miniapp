"use client";

/**
 * Шаг «Цена и склад» в редакторе товара: вместо одного поля «Остаток» — склад по партиям. Счётчик штук, полоса
 * состава, таблица партий и, когда штук стало больше, вопрос «Откуда +N шт?» (по умолчанию — новое поступление).
 * Ответ хранит редактор и отправляет его после сохранения товара; «Добавить» только сворачивает вопрос. Без права «Финансы» (или пока себестоимость не загружена) — обычное поле (`fallback`).
 */
import { Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { money } from "@/lib/money";
import { useProductCost } from "../../queries";
import { DEFAULT_LOT_SOURCE, batchLinesOf, lotName, lotSourceSummary, shelfLots, stockSummary, type LotSourceAnswer, type ShelfLot, type StockSummary } from "../../model/lots";
import type { BatchLineOption } from "../../model/types";
import { LotSourcePicker } from "./LotSourcePicker";
import { StockBar } from "./parts";
import { StockLotsTable } from "./StockLotsTable";

export interface StockLotsBlockProps {
  productId: string;
  /** Цена из формы (ещё не сохранённая) — маржа считается от неё. */
  priceMinor: number;
  /** Остаток из поля формы; null — у товара варианты: штуки правятся в вариантах, здесь только сумма. */
  stock: string | null;
  /** Сколько штук сейчас в форме (с вариантами — их сумма). */
  total: number;
  /** Сколько было, когда открыли форму. */
  base: number;
  onStock: (value: string) => void;
  answer: LotSourceAnswer | null;
  onAnswer: (a: LotSourceAnswer | null) => void;
  fallback: ReactNode;
}

function Counter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value) || 0;
  const btn = "grid h-[38px] w-[38px] place-items-center text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)] focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] outline-none disabled:opacity-40";
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-[var(--r-md)] border border-[var(--border-2)]">
      <button type="button" className={btn} aria-label="Меньше" disabled={n <= 0} onClick={() => onChange(String(Math.max(0, n - 1)))}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        className="tabular w-[58px] border-x border-[var(--border-2)] bg-transparent text-center font-display text-[17px] font-extrabold text-[var(--ink)] outline-none focus:bg-[var(--surface-3)]"
        inputMode="numeric"
        aria-label="Остаток"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      <button type="button" className={btn} aria-label="Больше" onClick={() => onChange(String(n + 1))}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** «Продаются сверху вниз: сначала старый остаток, потом №2, потом №4». */
function fifoNote(shelf: ShelfLot[]): string {
  const names = [...new Set(shelf.map((l) => (l.kind === "BATCH" ? `№${l.batchId}` : lotName(l).toLowerCase())))];
  if (names.length < 2) return "Продаются сверху вниз: первой уходит штука из верхней строки.";
  return `Продаются сверху вниз: сначала ${names[0]}, потом ${names.slice(1).join(", потом ")}.`;
}

/** Заголовок блока: «11 шт · средняя себестоимость …» или «11 → 16 шт», и строка под ним. */
function heads(s: StockSummary, raise: number, total: number, base: number, answer: LotSourceAnswer | null, lines: BatchLineOption[]) {
  if (raise > 0) {
    return { headline: `${base} → ${total} шт`, sub: lotSourceSummary(answer ?? DEFAULT_LOT_SOURCE, raise, lines) };
  }
  const headline = `${total} шт${s.avgCostMinor != null ? ` · средняя себестоимость ${money(s.avgCostMinor)}` : ""}`;
  if (!s.units) return { headline, sub: "на складе пусто" };
  if (!s.knownUnits) return { headline, sub: "закупка не указана" };
  return { headline, sub: `по ${s.knownUnits} шт с известной закупкой${s.unknownUnits ? ` · ${s.unknownUnits} шт без закупки` : ""}` };
}

export function StockLotsBlock({ productId, priceMinor, stock, total, base, onStock, answer, onAnswer, fallback }: StockLotsBlockProps) {
  const cost = useProductCost(productId);
  const [folded, setFolded] = useState(false);
  if (!cost) return <>{fallback}</>;
  const shelf = shelfLots(cost.lots);
  const s = stockSummary(shelf, priceMinor);
  const raise = stock == null ? 0 : (Number(stock) || 0) - base;
  const lines = batchLinesOf(cost.batchLines, null);
  const { headline, sub } = heads(s, raise, total, base, answer, lines);
  return (
    <section aria-label="Склад по партиям" className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-2)]">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="field-label">Склад по партиям</span>
          <span className="tabular font-display text-[17px] font-extrabold text-[var(--ink)]">{headline}</span>
          <span className="text-[12.5px] text-[var(--text-muted)]">
            {sub}
            {raise > 0 && folded && (
              <button type="button" className="ml-2 font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => setFolded(false)}>
                изменить
              </button>
            )}
          </span>
        </div>
        {stock != null ? <Counter value={stock} onChange={onStock} /> : <span className="text-[12px] text-[var(--text-faint)]">штуки — в вариантах ниже</span>}
      </div>
      {raise > 0 && !folded && (
        <div className="px-3.5 pb-3.5">
          <LotSourcePicker
            key={raise}
            units={raise}
            lines={lines}
            shelf={shelf}
            priceMinor={priceMinor}
            submitLabel={`Добавить ${raise} шт`}
            initial={answer}
            onChange={onAnswer}
            onSubmit={(a) => {
              onAnswer(a);
              setFolded(true);
            }}
            onCancel={() => {
              onAnswer(null);
              setFolded(false);
              onStock(String(base));
            }}
          />
        </div>
      )}
      {shelf.length > 0 && (
        <>
          <div className="px-3.5 pb-3.5">
            <StockBar lots={shelf} legend={false} />
          </div>
          <StockLotsTable cost={cost} shelf={shelf} summary={s} priceMinor={priceMinor} />
          <p className="flex items-center gap-2 border-t border-[var(--line)] px-3.5 py-2.5 text-[12px] text-[var(--text-faint)]">{fifoNote(shelf)}</p>
        </>
      )}
    </section>
  );
}
