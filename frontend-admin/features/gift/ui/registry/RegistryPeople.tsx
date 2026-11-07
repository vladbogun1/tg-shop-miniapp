"use client";

/** Режим «По людям»: карточка человека за месяц с полосой лимита и его подарками. */
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { groupByPerson, limitFill } from "../../model/registry-view";
import type { GiftRegistryRow } from "../../model/types";
import { GiftCell, OrderCell, Person } from "./RegistryCells";

export function RegistryPeople({ rows, limitMinor }: { rows: GiftRegistryRow[]; limitMinor: number }) {
  const groups = groupByPerson(rows);
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      {groups.map((g) => (
        <section key={g.key} className={cn("card-2 min-w-0 p-3", g.overLimit && "!border-[var(--danger)]")}>
          <div className="flex min-w-0 items-start justify-between gap-2">
            <Person r={{ customerName: g.name, phone: g.phone, tgUsername: g.tgUsername }} />
            <div className="tabular shrink-0 text-right">
              <div className={cn("font-semibold", g.overLimit && "text-[var(--danger-ink)]")}>{money(g.monthTotalMinor)}</div>
              <div className="text-[11.5px] text-[var(--text-faint)]">за {g.month}</div>
            </div>
          </div>
          {limitMinor > 0 && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
                <div
                  className={cn("h-full rounded-full", g.overLimit ? "bg-[var(--danger)]" : "bg-[var(--accent)]")}
                  style={{ width: `${limitFill(g.monthTotalMinor, limitMinor)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-[var(--text-faint)]">
                <span>лимит {money(limitMinor)}</span>
                {g.overLimit && <Badge tone="danger">сверх лимита</Badge>}
              </div>
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-2 border-t border-[var(--line)] pt-2">
            {g.rows.map((r, i) => (
              <li key={`${r.orderId}-${i}`} className="flex min-w-0 items-start justify-between gap-2 text-[12.5px]">
                <div className="min-w-0">
                  <GiftCell r={r} />
                  <div className="mt-0.5">
                    <OrderCell r={r} />
                  </div>
                </div>
                <div className="tabular shrink-0 text-right">
                  {money(r.valueMinor)}
                  {r.quantity > 1 && (
                    <div className="text-[11.5px] text-[var(--text-faint)]">
                      {r.quantity} × {money(r.unitMinor)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
