import { Percent } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { num, pct, uah } from "../../../model/format";
import { sortRows, type MarginSort } from "../../../model/margin";
import type { MarginRow } from "../../../model/types";
import { Empty, Panel, TableWrap, useLimited } from "../../kit";

const SORTS: { value: MarginSort; label: string }[] = [
  { value: "default", label: "Как в отчёте" },
  { value: "profit", label: "Прибыль" },
  { value: "revenue", label: "Выручка" },
  { value: "margin", label: "Маржа ↑" },
];

/** Таблица маржи по группе: на ноутбуке полная, на телефоне карточки с раскрытием (шт., себестоимость). */
export function MarginTable({ rows, label, actions }: { rows: MarginRow[]; label: string; actions: ReactNode }) {
  const [sort, setSort] = useState<MarginSort>("default");
  const sorted = sortRows(rows, sort);
  const lim = useLimited(sorted, 15);
  return (
    <Panel
      title={`Маржа: ${label.toLowerCase()}`}
      icon={Percent}
      hint="Выручка с известной себестоимостью, её себестоимость и прибыль. «Без себестоимости» — выручка, по которой посчитать нечем."
      actions={actions}
    >
      {rows.length === 0 ? (
        <Empty>Продаж с известной себестоимостью за период нет</Empty>
      ) : (
        <>
          <div className="mb-3">
            <SegmentedControl size="sm" options={SORTS} value={sort} onChange={setSort} />
          </div>
          <div className="hidden sm:block">
            <TableWrap>
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>{label.replace(/ы$/, "")}</th>
                    <th className="r">Шт.</th>
                    <th className="r">Выручка</th>
                    <th className="r">Себестоимость</th>
                    <th className="r">Прибыль</th>
                    <th className="r">Маржа</th>
                    <th className="r">Без себестоимости</th>
                  </tr>
                </thead>
                <tbody>
                  {lim.visible.map((x) => (
                    <tr key={x.key}>
                      <td className="font-semibold">{x.label}</td>
                      <td className="r">{num(x.units)}</td>
                      <td className="r">{uah(x.revenueMinor)}</td>
                      <td className="r">{uah(x.costMinor)}</td>
                      <td className={cn("r font-semibold", x.profitMinor < 0 ? "text-[#F87171]" : "text-[var(--ok)]")}>{uah(x.profitMinor)}</td>
                      <td className="r">{pct(x.marginPct)}</td>
                      <td className="r text-[var(--text-muted)]">{x.unknownRevenueMinor > 0 ? uah(x.unknownRevenueMinor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
          <ul className="flex flex-col sm:hidden">
            {lim.visible.map((x) => (
              <MarginCard key={x.key} x={x} />
            ))}
          </ul>
          {lim.toggle}
        </>
      )}
    </Panel>
  );
}

function MarginCard({ x }: { x: MarginRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-[var(--line)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-start justify-between gap-3 py-2.5 text-left"
      >
        <span className="min-w-0 break-words text-[13.5px] font-semibold text-[var(--text)]">
          {x.label}
          {x.unknownRevenueMinor > 0 && (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--text-faint)]">без себестоимости {uah(x.unknownRevenueMinor)}</span>
          )}
        </span>
        <span className="shrink-0 text-right text-[13px] mx-num">
          <b className={x.profitMinor < 0 ? "text-[#F87171]" : "text-[var(--ok)]"}>{uah(x.profitMinor)}</b>
          <span className="block text-[11.5px] text-[var(--text-muted)]">{pct(x.marginPct)}</span>
        </span>
      </button>
      {open && (
        <dl className="mb-2.5 grid grid-cols-3 gap-2 rounded-[var(--r-md)] bg-[var(--bg-2)] p-2.5 text-[12px]">
          <div>
            <dt className="text-[var(--text-faint)]">Шт.</dt>
            <dd className="font-semibold mx-num">{num(x.units)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-faint)]">Выручка</dt>
            <dd className="font-semibold mx-num">{uah(x.revenueMinor)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-faint)]">Себестоимость</dt>
            <dd className="font-semibold mx-num">{uah(x.costMinor)}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}
