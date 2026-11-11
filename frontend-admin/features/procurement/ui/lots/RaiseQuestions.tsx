"use client";

/**
 * «Откуда +N шт?» по каждой строке, где редактор товара добавил штуки: у товара без вариантов — одна, у товара с
 * вариантами — по одной на вариант («Откуда +2 шт · Чёрная?»). Ответ держит редактор (`answers` по `LotRaise.key`)
 * и отправляет после сохранения; «Добавить» только сворачивает вопрос, «Отмена» возвращает штуки строки как было.
 * Поставки и партии в вопросе — только этой строки (вариант считается отдельно).
 */
import { useState } from "react";
import { useProductCost } from "../../queries";
import { batchLinesOf, DEFAULT_LOT_SOURCE, lotSourceSummary, raiseLabel, shelfLots, type LotRaise, type LotSourceAnswer, type ShelfLot } from "../../model/lots";
import type { BatchLineOption, ProductCost } from "../../model/types";
import { LotSourcePicker } from "./LotSourcePicker";

export interface RaiseQuestionsProps {
  productId: string;
  priceMinor: number;
  raises: LotRaise[];
  answers: Record<string, LotSourceAnswer>;
  onAnswer: (key: string, a: LotSourceAnswer | null) => void;
  /** «Отмена»: вернуть штуки строки к тем, что были при открытии. */
  onRevert: (r: LotRaise) => void;
}

/** Строки поставок этой строки склада: у нового варианта (ещё без id) поставок нет. */
export function raiseLines(cost: ProductCost, r: LotRaise): BatchLineOption[] {
  if (r.variantId == null && r.name != null) return [];
  return batchLinesOf(cost.batchLines, r.variantId);
}

function raiseShelf(cost: ProductCost, r: LotRaise): ShelfLot[] {
  return shelfLots(cost.lots).filter((l) => (l.variantId ?? null) === r.variantId);
}

/** «Чёрная: +2 шт из поставки №4 · Белая: +1 шт · новое поступление · без закупки». */
export function raisesSummary(cost: ProductCost, raises: LotRaise[], answers: Record<string, LotSourceAnswer>): string {
  return raises
    .map((r) => `${r.name ? `${r.name}: ` : ""}${lotSourceSummary(answers[r.key] ?? DEFAULT_LOT_SOURCE, r.units, raiseLines(cost, r))}`)
    .join(" · ");
}

function RaiseQuestion({ cost, priceMinor, r, answer, onAnswer, onRevert }: { cost: ProductCost; priceMinor: number; r: LotRaise; answer: LotSourceAnswer | null; onAnswer: (a: LotSourceAnswer | null) => void; onRevert: () => void }) {
  const [folded, setFolded] = useState(false);
  const lines = raiseLines(cost, r);
  if (folded) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--text-muted)]">
        <span>
          {r.name && <b className="font-semibold text-[var(--ink)]">{r.name}: </b>}
          {lotSourceSummary(answer ?? DEFAULT_LOT_SOURCE, r.units, lines)}
        </span>
        <button type="button" className="font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => setFolded(false)}>
          изменить
        </button>
      </p>
    );
  }
  return (
    <LotSourcePicker
      key={r.units}
      units={r.units}
      title={raiseLabel(r)}
      lines={lines}
      shelf={raiseShelf(cost, r)}
      priceMinor={priceMinor}
      submitLabel={`Добавить ${r.units} шт`}
      initial={answer}
      onChange={onAnswer}
      onSubmit={(a) => {
        onAnswer(a);
        setFolded(true);
      }}
      onCancel={() => {
        onAnswer(null);
        onRevert();
      }}
    />
  );
}

export function RaiseQuestions({ productId, priceMinor, raises, answers, onAnswer, onRevert }: RaiseQuestionsProps) {
  const cost = useProductCost(productId);
  if (!cost || !raises.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {raises.map((r) => (
        <RaiseQuestion
          key={r.key}
          cost={cost}
          priceMinor={priceMinor}
          r={r}
          answer={answers[r.key] ?? null}
          onAnswer={(a) => onAnswer(r.key, a)}
          onRevert={() => onRevert(r)}
        />
      ))}
    </div>
  );
}
