"use client";

/**
 * «Прибыль» в карточке заказа: выручка − себестоимость − комиссия эквайринга, по строкам.
 * Рендерится только при праве «Финансы» (иначе null, запрос не уходит).
 */
import { useFinanceAccess } from "@/lib/costing";
import { useOrderProfitQuery } from "../../queries/details";
import { lineTitle } from "@/lib/preorders";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { pct } from "@/features/analytics";
import { Badge } from "@/components/ui/Badge";

export function OrderProfitBlock({ orderId }: { orderId: string }) {
  const finance = useFinanceAccess();
  const q = useOrderProfitQuery(orderId, finance);
  const p = q.data;
  if (!finance || !p) return null;
  const unknown = p.lines.reduce((n, l) => n + l.unknownUnits, 0);
  const tone = p.profitMinor < 0 ? "text-[#F87171]" : "text-[var(--ok)]";

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Прибыль</h3>
        {p.preliminary && <Badge tone="warn">предварительно</Badge>}
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13.5px]">
        <dt className="text-[var(--text-muted)]">Выручка</dt>
        <dd className="tabular text-right">{money(p.revenueMinor)}</dd>
        <dt className="text-[var(--text-muted)]">Себестоимость</dt>
        <dd className="tabular text-right">− {money(p.costMinor)}</dd>
        <dt className="text-[var(--text-muted)]">Комиссия эквайринга{p.feeEstimated && <span className="text-[var(--text-faint)]"> (оценка 1,3 %)</span>}</dt>
        <dd className="tabular text-right">− {money(p.feeMinor)}</dd>
        <dt className="font-semibold text-[var(--text)]">Прибыль</dt>
        <dd className={cn("tabular text-right font-display text-[16px] font-bold", tone)}>
          {money(p.profitMinor)} · {pct(p.marginPct)}
        </dd>
      </dl>

      {!p.complete && (
        <p className="mt-2 text-[12.5px] text-[var(--warn)]">Нет данных о себестоимости: {unknown} шт. — прибыль посчитана без них.</p>
      )}

      {p.lines.length > 0 && (
        <div className="mt-3 flex flex-col divide-y divide-[var(--line)] border-t border-[var(--line)] text-[12.5px]">
          {p.lines.map((l) => (
            <div key={l.itemId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
              <span className="min-w-0 break-words text-[var(--text)]">
                {lineTitle(l.title, l.variantName)} <span className="text-[var(--text-faint)]">× {l.units}</span>
                {l.gift && <span className="text-[var(--text-faint)]"> · подарок</span>}
                {l.preliminary && <span className="text-[var(--warn)]"> · предв.</span>}
              </span>
              <span className="tabular text-[var(--text-muted)]">
                {money(l.revenueMinor)} − {money(l.costMinor)}
                {l.unknownUnits > 0 && <span className="text-[var(--warn)]"> · без себестоимости {l.unknownUnits} шт.</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
