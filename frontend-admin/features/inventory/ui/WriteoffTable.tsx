"use client";

import { formatDateTime } from "@shop/core/time";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { leftOf } from "../model/writeoffs";
import type { WriteoffLine } from "../model/types";
import { Reason, RestoreButton, Undone } from "./parts";

/** Таблица списаний для широких экранов. */
export function WriteoffTable({ lines, onRestore }: { lines: WriteoffLine[]; onRestore: (l: WriteoffLine) => void }) {
  return (
    <div className="panel hidden min-w-0 overflow-x-auto lg:block">
      <table className="w-full min-w-[56rem] text-[13px]">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-[11.5px] text-[var(--text-faint)]">
            <th className="px-3 py-2 font-semibold">Дата</th>
            <th className="px-3 py-2 font-semibold">Товар</th>
            <th className="px-3 py-2 text-right font-semibold">Шт.</th>
            <th className="px-3 py-2 font-semibold">Причина</th>
            <th className="px-3 py-2 font-semibold">Заказ</th>
            <th className="px-3 py-2 text-right font-semibold">Сумма</th>
            <th className="px-3 py-2 font-semibold">Админ</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={cn("border-b border-[var(--line)] align-top last:border-0", leftOf(l) <= 0 && "opacity-60")}>
              <td className="whitespace-nowrap px-3 py-2">{formatDateTime(l.createdAt)}</td>
              <td className="px-3 py-2">
                <div className={cn("min-w-0 break-words font-medium text-[var(--text)]", leftOf(l) <= 0 && "line-through")}>{l.title}</div>
                {l.note && <div className="mt-0.5 break-words text-[12px] text-[var(--text-muted)]">{l.note}</div>}
              </td>
              <td className="tabular px-3 py-2 text-right">
                {l.quantity}
                <Undone l={l} />
              </td>
              <td className="px-3 py-2"><Reason l={l} /></td>
              <td className="whitespace-nowrap px-3 py-2">{l.orderShortId ? `#${l.orderShortId}` : "—"}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                {money(l.valueMinor)}
                {l.quantity > 1 && <div className="text-[11.5px] text-[var(--text-faint)]">{l.quantity} × {money(l.unitValueMinor)}</div>}
              </td>
              <td className="px-3 py-2">{l.adminName ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <RestoreButton l={l} onClick={() => onRestore(l)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
