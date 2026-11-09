"use client";

/** Итог приехавшей поставки одной строкой сверху страницы: сколько потратили, сколько заработали, что осталось. */
import { pct } from "@/features/analytics";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { useBatchSales } from "../queries";

export function BatchResult({ batchId }: { batchId: number }) {
  const q = useBatchSales(batchId);
  const s = q.data;
  if (!s) return null;
  const tone = s.profitMinor < 0 ? "text-[var(--danger-ink)]" : s.profitMinor > 0 ? "text-[var(--ok)]" : "text-[var(--ink)]";
  return (
    <div className="card mb-5 grid min-w-0 grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      <Fact label={s.profitMinor < 0 ? "Пока в минусе" : "Заработано"} value={money(s.profitMinor)} className={tone} big />
      <Fact label="Потратили" value={money(s.spentMinor)} sub="закупка и доставка" />
      <Fact label="Продали на" value={money(s.revenueMinor)} sub={s.marginPct != null ? `прибыль ${pct(s.marginPct)} с продаж` : undefined} />
      <Fact
        label="Осталось из поставки"
        value={`${s.left} шт`}
        sub={s.reserved > 0 ? `ещё ${s.reserved} шт ждут оплаты` : `из ${s.arrived} приехавших`}
      />
      {s.preliminary && <p className="col-span-full text-[12px] text-[var(--warn)]">Не все расходы внесены — цифры ещё поменяются.</p>}
    </div>
  );
}

function Fact({ label, value, sub, big, className }: { label: string; value: string; sub?: string; big?: boolean; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-[var(--text-muted)]">{label}</div>
      <div className={cn("tabular font-display font-bold", big ? "text-[22px]" : "text-[17px] text-[var(--ink)]", className)}>{value}</div>
      {sub && <div className="text-[11.5px] leading-snug text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}
