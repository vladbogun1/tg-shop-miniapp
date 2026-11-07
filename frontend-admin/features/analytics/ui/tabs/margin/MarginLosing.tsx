import { TrendingDown } from "lucide-react";
import { losingRows } from "../../../model/margin";
import { pct, uah } from "../../../model/format";
import type { MarginRow } from "../../../model/types";
import { Panel } from "../../kit";

function List({ title, rows, red }: { title: string; rows: MarginRow[]; red?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <div className="field-label mb-1.5 !text-[11px]">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((x) => (
          <li key={x.key} className="flex items-start justify-between gap-3 text-[13px]">
            <span className="min-w-0 break-words font-semibold text-[var(--text)]">{x.label}</span>
            <span className="shrink-0 text-right mx-num" style={{ color: red ? "var(--mx-down)" : "var(--text)" }}>
              {uah(x.profitMinor)} <span className="text-[var(--text-muted)]">· {pct(x.marginPct)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Где теряю»: по текущей группе таблицы — убыточные строки и самая тонкая маржа. */
export function MarginLosing({ rows, groupLabel }: { rows: MarginRow[]; groupLabel: string }) {
  const { loss, thin } = losingRows(rows);
  return (
    <Panel title="Где теряю" icon={TrendingDown} hint={`Разрез «${groupLabel.toLowerCase()}», только выручка с известной себестоимостью.`}>
      {loss.length === 0 && thin.length === 0 ? (
        <div className="py-3 text-center text-[13px] text-[var(--text-faint)]">Продаж с известной себестоимостью за период нет</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {loss.length > 0 ? <List title="Убыточные" rows={loss} red /> : <div className="text-[13px] text-[var(--text-muted)]">Убыточных строк нет</div>}
          <List title="Самая низкая маржа" rows={thin} />
        </div>
      )}
    </Panel>
  );
}
