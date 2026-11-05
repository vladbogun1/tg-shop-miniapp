"use client";

/**
 * Блок «Продажи по товарам» приехавшей поставки: что продано, что осталось и сколько заработано на каждом товаре.
 * Общий итог — в `BatchResult` наверху страницы. «Продано» — только в оплаченных заказах (как в «Метриках»);
 * ждущие онлайн-оплаты — отдельно, «ждут оплаты». Только с правом «Финансы».
 */
import { QueryState } from "@/components/ui/QueryState";
import { lineTitle, type BatchSales } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { useBatchSales } from "../queries";

export function BatchSalesTab({ batchId }: { batchId: number }) {
  const q = useBatchSales(batchId);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем продажи поставки">
      {q.data && <SalesBody s={q.data} />}
    </QueryState>
  );
}

type Line = BatchSales["lines"][number];

const profitTone = (minor: number) => (minor < 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]");

function SalesBody({ s }: { s: BatchSales }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[13px] text-[var(--text-muted)]">
        Остаток на складе стоит {money(s.leftValueMinor)} (по тому, во сколько обошёлся).{" "}
        {s.soldOutAt
          ? `Распродана ${formatDateTime(s.soldOutAt)}${s.daysToSellOut != null ? ` — за ${s.daysToSellOut} дн.` : ""}`
          : "Ещё не распродана."}
      </p>

      {/* Телефон: карточка на товар — таблица в 9 колонок там не читается. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {s.lines.map((l) => (
          <SalesCard key={l.itemId} l={l} />
        ))}
      </div>

      <div className="card thin-scroll hidden overflow-x-auto p-0 sm:block">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="r">Приехало</th>
              <th className="r">Продано</th>
              <th className="r">Ждут оплаты</th>
              <th className="r">Осталось</th>
              <th className="r">Обошлась 1 шт</th>
              <th className="r">Продали на</th>
              <th className="r">Заработали</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.itemId}>
                <td className="font-semibold">{lineTitle(l.title, l.variantName)}</td>
                <td className="r">{l.arrived}</td>
                <td className="r">{l.sold}</td>
                <td className="r">{l.reserved || "—"}</td>
                <td className="r">{l.left}</td>
                <td className="r">{l.costUnitMinor != null ? money(l.costUnitMinor) : "—"}</td>
                <td className="r">{money(l.revenueMinor)}</td>
                <td className={cn("r font-semibold", profitTone(l.profitMinor))}>{money(l.profitMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[var(--text-faint)]">
        Продано — как в «Метриках»: наложенный платёж сразу, онлайн-оплата и предоплата — после оплаты. «Ждут оплаты» — со склада уже ушло, но в
        «продали» и «заработали» пока не входит.
      </p>
    </div>
  );
}

function SalesCard({ l }: { l: Line }) {
  return (
    <div className="card-2 min-w-0 p-3">
      <div className="break-words text-[14px] font-semibold text-[var(--text)]">{lineTitle(l.title, l.variantName)}</div>
      <div className="tabular mt-1.5 grid grid-cols-3 gap-2 text-[12px] text-[var(--text-muted)]">
        <Num label="Продано" value={`${l.sold} из ${l.arrived}`} />
        <Num label="Осталось" value={l.reserved ? `${l.left} (+${l.reserved} ждут)` : `${l.left}`} />
        <Num label="Заработали" value={money(l.profitMinor)} className={profitTone(l.profitMinor)} />
      </div>
    </div>
  );
}

function Num({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div>{label}</div>
      <div className={cn("font-display text-[14px] font-bold text-[var(--ink)]", className)}>{value}</div>
    </div>
  );
}
