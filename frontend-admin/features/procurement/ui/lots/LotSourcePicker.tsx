"use client";

/**
 * «Откуда +N шт?» — ответ на добавленные штуки: новое поступление (по умолчанию — встают в конец очереди и продаются
 * последними), из приехавшей поставки (себестоимость — её), старый / неучтённый остаток (закупка + доставка за штуку
 * руками) или «другое» с пояснением. Что делать с ответом — решает тот, кто
 * открыл: редактор товара отправит его после сохранения, строка таблицы — сразу.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { inputToMinor, minorToInput } from "../../model/costing";
import { answerCost, batchLineLabel, lotMargin, lotSourceProblem, type LotSourceAnswer, type ShelfLot, pctText } from "../../model/lots";
import type { BatchLineOption } from "../../model/types";

type Kind = LotSourceAnswer["kind"];

interface Draft {
  kind: Kind;
  batchItemId: number | null;
  purchase: string;
  extra: string;
  note: string;
}

function draftOf(initial: LotSourceAnswer | null | undefined, lines: BatchLineOption[]): Draft {
  const first = lines[0]?.batchItemId ?? null;
  if (!initial) return { kind: "NEW", batchItemId: first, purchase: "", extra: "", note: "" };
  if (initial.kind === "BATCH") return { kind: "BATCH", batchItemId: initial.batchItemId, purchase: "", extra: "", note: "" };
  return { kind: initial.kind, batchItemId: first, purchase: minorToInput(initial.purchaseMinor), extra: minorToInput(initial.extraMinor), note: initial.note };
}

function answerOf(d: Draft): LotSourceAnswer | null {
  if (d.kind === "BATCH") return d.batchItemId == null ? null : { kind: "BATCH", batchItemId: d.batchItemId };
  return { kind: d.kind, purchaseMinor: inputToMinor(d.purchase), extraMinor: inputToMinor(d.extra), note: d.note };
}

const FIELD =
  "h-[34px] min-w-0 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--bg-2)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] placeholder:text-[var(--text-faint)]";

function Option({ on, disabled, title, hint, onPick, children }: { on: boolean; disabled?: boolean; title: string; hint: string; onPick: () => void; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[20px_1fr] items-start gap-2.5 rounded-[var(--r-md)] border px-3 py-2.5",
        on ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--line)] bg-[var(--surface)]",
        disabled && "opacity-55"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        onClick={onPick}
        className="col-span-2 grid grid-cols-[20px_1fr] items-start gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <span className={cn("mt-px grid h-[18px] w-[18px] place-items-center rounded-full border-2", on ? "border-[var(--accent)]" : "border-[var(--border-2)]")}>
          {on && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
        </span>
        <span>
          <b className="block text-[13.5px] font-semibold text-[var(--ink)]">{title}</b>
          <small className="mt-px block text-[12px] text-[var(--text-faint)]">{hint}</small>
        </span>
      </button>
      {on && children && <div className="col-start-2 mt-1 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function CostInputs({ d, set, optional }: { d: Draft; set: (p: Partial<Draft>) => void; optional?: boolean }) {
  return (
    <>
      <input
        className={cn(FIELD, "w-[150px]")}
        inputMode="decimal"
        placeholder={optional ? "закупка/шт, ₴" : "закупка/шт, ₴ *"}
        aria-label="Закупка за штуку, ₴"
        value={d.purchase}
        onChange={(e) => set({ purchase: e.target.value })}
      />
      <input
        className={cn(FIELD, "w-[130px]")}
        inputMode="decimal"
        placeholder="доставка/шт, ₴"
        aria-label="Доставка за штуку, ₴"
        value={d.extra}
        onChange={(e) => set({ extra: e.target.value })}
      />
    </>
  );
}

function Preview({ a, units, lines, shelf, priceMinor }: { a: LotSourceAnswer | null; units: number; lines: BatchLineOption[]; shelf: ShelfLot[]; priceMinor: number }) {
  if (!a || lotSourceProblem(a)) return null;
  const cost = answerCost(a, lines);
  const m = lotMargin(cost, priceMinor);
  let where: string;
  if (a.kind === "BATCH") {
    const line = lines.find((b) => b.batchItemId === a.batchItemId);
    const now = shelf.filter((l) => l.batchItemId === a.batchItemId).reduce((n, l) => n + l.qtyLeft, 0);
    where = `Поставка №${line?.batchId ?? "?"} — ${now + units} шт`;
  } else {
    where = { NEW: `Новое поступление — ${units} шт, продаются последними`, OLD: `Старый остаток — ${units} шт`, OTHER: `Другое — ${units} шт` }[a.kind];
  }
  return (
    <div className="tabular flex flex-wrap gap-x-3.5 gap-y-1 rounded-[var(--r-md)] bg-[var(--bg-2)] px-2.5 py-2 text-[12.5px] text-[var(--text-muted)]">
      <span>
        После сохранения: <b className="font-semibold text-[var(--ink)]">{where}</b>
      </span>
      {cost != null ? (
        <>
          <span>
            себестоимость <b className="font-semibold text-[var(--ink)]">{money(cost)}</b>
          </span>
          {m && (
            <span>
              маржа <span className={cn("font-bold", m.minor < 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]")}>{money(m.minor)} · {pctText(m.pct)}</span>
            </span>
          )}
        </>
      ) : (
        <span>без закупки — маржу не посчитать</span>
      )}
    </div>
  );
}

export interface LotSourcePickerProps {
  units: number;
  /** Строки приехавших поставок этого товара (варианта). */
  lines: BatchLineOption[];
  shelf: ShelfLot[];
  priceMinor: number;
  submitLabel: string;
  initial?: LotSourceAnswer | null;
  busy?: boolean;
  error?: string | null;
  onSubmit: (a: LotSourceAnswer) => void;
  onCancel: () => void;
  /** Каждое изменение выбора (редактор товара держит ответ, даже если «Добавить» не нажали). */
  onChange?: (a: LotSourceAnswer | null) => void;
}

export function LotSourcePicker({ units, lines, shelf, priceMinor, submitLabel, initial, busy, error, onSubmit, onCancel, onChange }: LotSourcePickerProps) {
  const [d, setD] = useState<Draft>(() => draftOf(initial, lines));
  const set = (p: Partial<Draft>) => {
    const next = { ...d, ...p };
    setD(next);
    onChange?.(answerOf(next));
  };
  const headId = useId();
  const answer = answerOf(d);
  const problem = lotSourceProblem(answer);
  return (
    <div
      role="group"
      aria-labelledby={headId}
      className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[rgba(255,102,0,.45)] bg-[linear-gradient(180deg,rgba(255,102,0,.07),rgba(255,102,0,.02))] p-3.5"
    >
      <h5 id={headId} className="font-display text-[14px] font-extrabold tracking-[.02em] text-[var(--ink)]">
        Откуда +{units} шт?
      </h5>
      <div role="radiogroup" aria-labelledby={headId} className="flex flex-col gap-2">
        <Option
          on={d.kind === "NEW"}
          title="Новое поступление"
          hint="купили сейчас — встанут в конец очереди и продадутся последними; закупку можно вписать сразу или потом"
          onPick={() => set({ kind: "NEW" })}
        >
          <CostInputs d={d} set={set} optional />
        </Option>
        <Option
          on={d.kind === "BATCH"}
          disabled={!lines.length}
          title="Из поставки"
          hint={lines.length ? "штуки приехали, но не попали на склад при «Приехала»" : "приехавших поставок с этим товаром нет"}
          onPick={() => set({ kind: "BATCH" })}
        >
          <select
            className={cn(FIELD, "flex-[1_1_260px]")}
            aria-label="Поставка"
            value={d.batchItemId ?? ""}
            onChange={(e) => set({ batchItemId: Number(e.target.value) || null })}
          >
            {lines.map((b) => (
              <option key={b.batchItemId} value={b.batchItemId}>
                {batchLineLabel(b)}
              </option>
            ))}
          </select>
        </Option>
        <Option
          on={d.kind === "OLD"}
          title="Старый / неучтённый остаток"
          hint="нашлись, были до поставок — впишите закупку и доставку за штуку"
          onPick={() => set({ kind: "OLD" })}
        >
          <CostInputs d={d} set={set} />
        </Option>
        <Option
          on={d.kind === "OTHER"}
          title="Другое"
          hint="пересорт, возврат без заказа, подарок от завода — с пояснением; без закупки штуки останутся «без закупки»"
          onPick={() => set({ kind: "OTHER" })}
        >
          <input
            className={cn(FIELD, "flex-[1_1_220px]")}
            placeholder="откуда они"
            aria-label="Пояснение"
            maxLength={200}
            value={d.note}
            onChange={(e) => set({ note: e.target.value })}
          />
          <CostInputs d={d} set={set} optional />
        </Option>
      </div>
      <Preview a={answer} units={units} lines={lines} shelf={shelf} priceMinor={priceMinor} />
      {error && <p className="text-[12.5px] text-[var(--danger-ink)]">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {problem && <span className="mr-auto text-[12px] text-[var(--text-faint)]">{problem}</span>}
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
        <Button size="sm" variant="accent" loading={busy} disabled={!!problem} onClick={() => answer && onSubmit(answer)}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
