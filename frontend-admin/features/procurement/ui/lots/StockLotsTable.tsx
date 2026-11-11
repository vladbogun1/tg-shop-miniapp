"use client";

/**
 * Шаг «Цена и склад» → таблица «откуда, сколько, закупка, доставка, себестоимость, маржа» по партиям склада.
 * Себестоимость поставок только читается (её правят в поставке, чтобы не разъехались расходы партии); у старого и
 * добавленного руками остатка закупку и доставку вписывают прямо в строке — маржа пересчитывается сразу.
 * На телефоне строки становятся карточками.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { useAssignLotSource, useSetLotCost } from "../../queries";
import { inputToMinor, minorToInput } from "../../model/costing";
import { batchLinesOf, dayOf, fxLine, lotMargin, lotName, lotSourceRequest, type LotSourceAnswer, type ShelfLot, type StockSummary, pctText } from "../../model/lots";
import type { ProductCost } from "../../model/types";
import { LotSourcePicker } from "./LotSourcePicker";
import { LotDot, deliveryNote } from "./parts";

const TD = "align-top px-2.5 py-3 text-right whitespace-nowrap max-sm:p-0 max-sm:text-left max-sm:whitespace-normal";
/** На телефоне у ячейки своя подпись (заголовков таблицы там нет). */
const LABELED =
  "max-sm:before:mb-0.5 max-sm:before:block max-sm:before:font-display max-sm:before:text-[10px] max-sm:before:font-semibold max-sm:before:uppercase max-sm:before:tracking-[.07em] max-sm:before:text-[var(--text-faint)] max-sm:before:content-[attr(data-k)]";
const SUB = "mt-0.5 block text-[11.5px] font-normal text-[var(--text-faint)]";
const ROW = "border-t max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-3.5 max-sm:py-2.5";
const INPUT =
  "h-[34px] w-full min-w-0 rounded-[var(--r-md)] border bg-[var(--bg-2)] px-2.5 text-[13.5px] font-semibold text-[var(--ink)] outline-none tabular placeholder:font-normal placeholder:text-[var(--text-faint)] focus:border-solid focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]";

function Td({ k, className, children }: { k?: string; className?: string; children: ReactNode }) {
  return (
    <td data-k={k} className={cn(TD, k && LABELED, className)}>
      {children}
    </td>
  );
}

function MarginCell({ cost, priceMinor, empty }: { cost: number | null; priceMinor: number; empty: string }) {
  const m = lotMargin(cost, priceMinor);
  if (!m) return <Td k="Маржа / шт" className="text-[var(--text-faint)]">{cost == null ? empty : "нет цены"}</Td>;
  return (
    <Td k="Маржа / шт" className={cn("font-bold", m.minor < 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]")}>
      {money(m.minor)}
      <span className={SUB}>{pctText(m.pct)}</span>
    </Td>
  );
}

function SourceCell({ l, children }: { l: ShelfLot; children?: ReactNode }) {
  const sub =
    l.kind === "BATCH"
      ? [l.batchTitle, dayOf(l.arrivedAt), `${l.qtyLeft} из ${l.qtyIn}`]
      : [l.unitCostMinor == null ? "без поставки, закупка не указана" : "закупка вписана вручную"];
  if (l.next) sub.push("продаются первыми");
  return (
    <td className="min-w-[190px] px-2.5 py-3 pl-3.5 text-left align-top max-sm:col-span-2 max-sm:min-w-0 max-sm:p-0">
      <div className="flex items-start gap-2">
        <LotDot lot={l} className="mt-1" />
        <div className="min-w-0">
          {l.kind === "BATCH" && l.batchId != null ? (
            <Link href={`/preorders/${l.batchId}`} className="font-semibold text-[var(--accent-hi)] hover:underline">
              {lotName(l)}
            </Link>
          ) : (
            <b className="font-semibold text-[var(--ink)]">{lotName(l)}</b>
          )}
          {l.variantName && <span className="text-[var(--text-faint)]"> · {l.variantName}</span>}
          <span className={SUB}>{sub.filter(Boolean).join(" · ")}</span>
          {children}
        </div>
      </div>
    </td>
  );
}

function BatchRow({ l, priceMinor }: { l: ShelfLot; priceMinor: number }) {
  return (
    <tr className={cn(ROW, "border-[var(--line)]")}>
      <SourceCell l={l} />
      <Td k="Шт" className="font-bold text-[var(--ink)]">{l.qtyLeft}</Td>
      <Td k="Закупка / шт">
        {l.purchaseUnitMinor != null ? money(l.purchaseUnitMinor) : "—"}
        {fxLine(l) && <span className={SUB}>{fxLine(l)}</span>}
      </Td>
      <Td k="Доставка / шт">
        {l.extraUnitMinor != null ? money(l.extraUnitMinor) : "—"}
        <span className={SUB}>{deliveryNote(l)}</span>
      </Td>
      <Td k="Себест. / шт" className="font-bold text-[var(--ink)]">{l.unitCostMinor != null ? money(l.unitCostMinor) : "—"}</Td>
      <MarginCell cost={l.unitCostMinor} priceMinor={priceMinor} empty="расходы не внесены" />
    </tr>
  );
}

/** Поля закупки и доставки строки: что набрано, во что обходится штука, поменяли ли и можно ли сохранить. */
function useManualCost(l: ShelfLot) {
  const initial = { purchase: minorToInput(l.purchaseUnitMinor), extra: minorToInput(l.extraUnitMinor) };
  const [v, setV] = useState(initial);
  const purchase = inputToMinor(v.purchase);
  const extra = inputToMinor(v.extra);
  return {
    v,
    setV,
    purchase,
    extra,
    cost: purchase == null ? null : purchase + (extra ?? 0),
    dirty: v.purchase !== initial.purchase || v.extra !== initial.extra,
    bad: (purchase ?? 0) < 0 || (extra ?? 0) < 0 || (v.purchase.trim() !== "" && purchase == null) || (v.extra.trim() !== "" && extra == null),
  };
}

/** Старый / ручной остаток: закупка и доставка — поля; «Сохранить» появляется, когда цифры поменяли. */
function ManualRow({ l, priceMinor, onWhere }: { l: ShelfLot; priceMinor: number; onWhere?: () => void }) {
  const { v, setV, purchase, extra, cost, dirty, bad } = useManualCost(l);
  const save = useSetLotCost();
  const input = (key: "purchase" | "extra", label: string, placeholder: string) => (
    <input
      className={cn(INPUT, v[key].trim() ? "border-[var(--line-strong)]" : "border-dashed border-[rgba(245,158,11,.55)]")}
      inputMode="decimal"
      aria-label={`${label} за штуку, ${lotName(l)}`}
      placeholder={placeholder}
      value={v[key]}
      onChange={(e) => setV((cur) => ({ ...cur, [key]: e.target.value }))}
    />
  );
  return (
    <tr className={cn(ROW, "border-[var(--line)] bg-[rgba(245,158,11,.05)]")}>
      <SourceCell l={l}>
        {(dirty || onWhere) && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {dirty && (
              <Button
                size="sm"
                variant="accent"
                loading={save.isPending}
                disabled={bad}
                onClick={() => save.mutate({ lotId: l.id, body: { purchaseMinor: purchase, extraMinor: purchase == null ? null : extra } })}
              >
                Сохранить закупку
              </Button>
            )}
            {onWhere && !dirty && (
              <Button size="sm" variant="ghost" onClick={onWhere}>
                Откуда они?
              </Button>
            )}
          </span>
        )}
      </SourceCell>
      <Td k="Шт" className="font-bold text-[var(--ink)]">{l.qtyLeft}</Td>
      <Td k="Закупка / шт" className="w-[118px] min-w-[118px] max-sm:w-auto max-sm:min-w-0">{input("purchase", "Закупка", "впишите, ₴")}</Td>
      <Td k="Доставка / шт" className="w-[118px] min-w-[118px] max-sm:w-auto max-sm:min-w-0">{input("extra", "Доставка", "0 ₴")}</Td>
      <Td k="Себест. / шт" className={cost == null ? "text-[var(--text-faint)]" : "font-bold text-[var(--ink)]"}>{cost == null ? "—" : money(cost)}</Td>
      <MarginCell cost={cost} priceMinor={priceMinor} empty="впишите закупку" />
    </tr>
  );
}

function Totals({ s }: { s: StockSummary }) {
  const foot = "bg-[var(--bg-2)] font-bold max-sm:bg-transparent";
  return (
    <tfoot className="max-sm:block">
      <tr className={cn(ROW, "border-[var(--line-strong)] text-[var(--ink)] max-sm:bg-[var(--bg-2)]")}>
        <td className={cn(foot, "py-3 pl-3.5 pr-2.5 text-left text-[var(--ink)] max-sm:col-span-2 max-sm:p-0")}>Итого на складе</td>
        <Td k="Шт" className={foot}>{s.units}</Td>
        <Td k="Закупка" className={foot}>
          {s.knownUnits} шт известны
          {s.unknownUnits > 0 && <span className={SUB}>{s.unknownUnits} шт без закупки</span>}
        </Td>
        <Td k="" className={cn(foot, "max-sm:hidden")}>
          {""}
        </Td>
        <Td k="Себест. склада" className={foot}>
          {money(s.costMinor)}
          {s.unknownUnits > 0 && <span className={SUB}>+ {s.unknownUnits} шт ?</span>}
        </Td>
        <Td k="Прибыль со склада" className={cn(foot, "text-[var(--ok)]")}>
          {s.profitMinor != null ? money(s.profitMinor) : "—"}
          {s.knownUnits > 0 && <span className={SUB}>по {s.knownUnits} шт</span>}
        </Td>
      </tr>
    </tfoot>
  );
}

/** «Откуда они?» у строки без закупки: тот же вопрос, что при добавлении штук, но ответ уходит сразу. */
function FixWhere({ cost, lot, shelf, priceMinor, onDone }: { cost: ProductCost; lot: ShelfLot; shelf: ShelfLot[]; priceMinor: number; onDone: () => void }) {
  const assign = useAssignLotSource();
  const [error, setError] = useState<string | null>(null);
  async function submit(a: LotSourceAnswer) {
    const body = lotSourceRequest(a, lot.qtyLeft, lot.variantId ?? null);
    if (!body) {
      toast.info("Без закупки ничего не меняется — штуки остаются «без закупки»");
      onDone();
      return;
    }
    try {
      setError(null);
      await assign.mutateAsync({ productId: cost.productId, body });
      toast.success(`${lot.qtyLeft} шт привязаны`);
      onDone();
    } catch (e) {
      setError(errorMessage(e, undefined, "Не удалось сохранить"));
    }
  }
  return (
    <div className="border-t border-[var(--line)] p-3.5">
      <LotSourcePicker
        units={lot.qtyLeft}
        lines={batchLinesOf(cost.batchLines, lot.variantId ?? null)}
        shelf={shelf}
        priceMinor={priceMinor}
        submitLabel={`Сохранить ${lot.qtyLeft} шт`}
        busy={assign.isPending}
        error={error}
        onSubmit={(a) => void submit(a)}
        onCancel={onDone}
      />
    </div>
  );
}

export function StockLotsTable({ cost, shelf, summary, priceMinor }: { cost: ProductCost; shelf: ShelfLot[]; summary: StockSummary; priceMinor: number }) {
  const [fixing, setFixing] = useState<number | null>(null);
  const fixLot = shelf.find((l) => l.id === fixing);
  const th = "bg-[var(--bg-2)] px-2.5 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--text-faint)] whitespace-nowrap";
  return (
    <>
      <div className="overflow-x-auto border-t border-[var(--line)]">
        <table className="tabular w-full border-collapse text-[13px] max-sm:block">
          <thead className="max-sm:hidden">
            <tr>
              <th className={cn(th, "pl-3.5 text-left")}>Откуда</th>
              <th className={cn(th, "text-right")}>Шт</th>
              <th className={cn(th, "text-right")}>Закупка / шт</th>
              <th className={cn(th, "text-right")}>Доставка / шт</th>
              <th className={cn(th, "text-right")}>Себест. / шт</th>
              <th className={cn(th, "text-right")}>Маржа / шт</th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {shelf.map((l) =>
              l.kind === "BATCH" ? (
                <BatchRow key={l.id} l={l} priceMinor={priceMinor} />
              ) : (
                <ManualRow
                  // after a save the lot comes back with new numbers: the inputs start over from them
                  key={`${l.id}:${l.unitCostMinor}:${l.extraUnitMinor}`}
                  l={l}
                  priceMinor={priceMinor}
                  onWhere={l.unitCostMinor == null && batchLinesOf(cost.batchLines, l.variantId ?? null).length ? () => setFixing(l.id) : undefined}
                />
              )
            )}
          </tbody>
          <Totals s={summary} />
        </table>
      </div>
      {fixLot && <FixWhere key={fixLot.id} cost={cost} lot={fixLot} shelf={shelf} priceMinor={priceMinor} onDone={() => setFixing(null)} />}
    </>
  );
}
