"use client";

/** Подарки списком: таблица (с 768 px, строка итога) или карточки на телефоне. */
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import type { GiftRegistryRow } from "../../model/types";
import { totalOf } from "../../model/registry-view";
import { GiftCell, HandedOver, MonthTotal, OrderCell, Person } from "./RegistryCells";

function Qty({ r }: { r: GiftRegistryRow }) {
  return r.quantity > 1 ? (
    <div className="text-[11.5px] font-normal text-[var(--text-faint)]">
      {r.quantity} × {money(r.unitMinor)}
    </div>
  ) : null;
}

export function RegistryList({ rows }: { rows: GiftRegistryRow[] }) {
  const total = totalOf(rows);
  return (
    <>
      <div className="panel hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11.5px] text-[var(--text-faint)]">
              <th className="px-3 py-2 font-semibold">Вручён</th>
              <th className="px-3 py-2 font-semibold">Заказ</th>
              <th className="px-3 py-2 font-semibold">Получатель</th>
              <th className="px-3 py-2 font-semibold">Подарок</th>
              <th className="px-3 py-2 text-right font-semibold">Стоимость</th>
              <th className="px-3 py-2 text-right font-semibold">За месяц</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.orderId}-${i}`}
                className={cn("border-b border-[var(--line)] align-top", r.overLimit && "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]")}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <HandedOver r={r} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <OrderCell r={r} />
                </td>
                <td className="px-3 py-2">
                  <Person r={r} />
                </td>
                <td className="px-3 py-2">
                  <GiftCell r={r} />
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                  {money(r.valueMinor)}
                  <Qty r={r} />
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                  <MonthTotal r={r} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--surface-2)] text-[13px] font-semibold">
              <td className="px-3 py-2" colSpan={4}>
                Итого: {total.count}
              </td>
              <td className="tabular px-3 py-2 text-right">{money(total.valueMinor)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid min-w-0 gap-2 md:hidden">
        {rows.map((r, i) => (
          <div key={`${r.orderId}-${i}`} className={cn("card-2 min-w-0 px-3 py-2.5", r.overLimit && "!border-[var(--danger)]")}>
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <GiftCell r={r} />
              </div>
              <div className="tabular shrink-0 text-right font-semibold">
                {money(r.valueMinor)}
                <Qty r={r} />
              </div>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[12.5px]">
              <Person r={r} />
              <div className="text-right">
                <MonthTotal r={r} />
              </div>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 text-[12px] text-[var(--text-muted)]">
              <OrderCell r={r} />
              <HandedOver r={r} />
            </div>
          </div>
        ))}
        <div className="tabular px-1 text-right text-[13px] font-semibold">
          Итого: {total.count} · {money(total.valueMinor)}
        </div>
      </div>
    </>
  );
}
