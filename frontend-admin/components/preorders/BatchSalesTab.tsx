"use client";

/**
 * Карточка поставки → «Продажи»: сколько потрачено, сколько продано и заработано, что осталось на полке.
 * «Продано» — только в оплаченных заказах (как в «Метриках»); ждущие онлайн-оплаты — отдельно, «в брони».
 * Только с правом «Финансы».
 */
import { useQuery } from "@tanstack/react-query";
import { COSTING_KEY, costingApi, type BatchSales } from "@/lib/costing";
import { lineTitle } from "@/lib/preorders";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import { pct } from "@/components/metrics/format";
import { Badge } from "@/components/ui/Badge";
import { QueryState } from "@/components/ui/QueryState";

export function BatchSalesTab({ batchId }: { batchId: number }) {
  const q = useQuery({ queryKey: [...COSTING_KEY, "sales", batchId], queryFn: () => costingApi.sales(batchId), retry: false });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем продажи поставки">
      {q.data && <SalesBody s={q.data} />}
    </QueryState>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={cn("tabular font-display text-[18px] font-bold", tone === "ok" ? "text-[var(--ok)]" : tone === "bad" ? "text-[#F87171]" : "text-[var(--ink)]")}>{value}</div>
      {sub && <div className="text-[11px] leading-snug text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

function SalesBody({ s }: { s: BatchSales }) {
  const tone = s.profitMinor < 0 ? "bad" : s.profitMinor > 0 ? "ok" : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {s.preliminary && (
        <div className="flex items-center gap-2">
          <Badge tone="warn" dot>себестоимость предварительная</Badge>
          <span className="text-[12.5px] text-[var(--text-muted)]">не все расходы внесены — прибыль может измениться</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Потрачено" value={money(s.spentMinor)} sub="закупка и расходы" />
        <Tile label="Выручка" value={money(s.revenueMinor)} />
        <Tile label="Себестоимость проданного" value={money(s.costOfSoldMinor)} />
        <Tile label="Прибыль" value={money(s.profitMinor)} tone={tone} />
        <Tile label="Маржа" value={pct(s.marginPct)} tone={tone} />
        <Tile
          label="Приехало / продано / осталось"
          value={`${s.arrived} / ${s.sold} / ${s.left}`}
          sub={
            s.reserved > 0
              ? `ещё ${s.reserved} шт. в брони — ждут оплаты`
              : s.daysToSellOut != null
                ? `распродана за ${s.daysToSellOut} дн`
                : s.arrivedAt
                  ? `приехала ${formatDateTime(s.arrivedAt)}`
                  : undefined
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Стоимость остатка" value={money(s.leftValueMinor)} sub="по себестоимости" />
        <Tile label="Дней до распродажи" value={s.daysToSellOut != null ? String(s.daysToSellOut) : "—"} sub={s.soldOutAt ? `распродана ${formatDateTime(s.soldOutAt)}` : "ещё не распродана"} />
      </div>

      <div className="card thin-scroll overflow-x-auto p-0">
        <table className="data-table min-w-[820px]">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="r">Приехало</th>
              <th className="r">Продано</th>
              <th className="r">В брони</th>
              <th className="r">Осталось</th>
              <th className="r">Себестоимость/шт</th>
              <th className="r">Выручка</th>
              <th className="r">Себестоимость</th>
              <th className="r">Прибыль</th>
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
                <td className="r">{money(l.costMinor)}</td>
                <td className={cn("r font-semibold", l.profitMinor < 0 ? "text-[#F87171]" : "text-[var(--ok)]")}>{money(l.profitMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[var(--text-faint)]">
        Продано — как в «Метриках»: наложенный платёж сразу, онлайн-оплата и предоплата — после оплаты. «В брони» —
        заказы, которые ещё ждут онлайн-оплаты: со склада уже ушло, но в выручку и прибыль не входит.
      </p>
    </div>
  );
}
