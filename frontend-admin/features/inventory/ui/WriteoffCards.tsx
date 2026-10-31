"use client";

import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import type { WriteoffLine } from "../model/types";
import { Reason, RestoreButton, Undone } from "./parts";

/** Карточки списаний для телефона и планшета. */
export function WriteoffCards({ lines, onRestore }: { lines: WriteoffLine[]; onRestore: (l: WriteoffLine) => void }) {
  return (
    <div className="grid min-w-0 gap-2 lg:hidden">
      {lines.map((l) => (
        <div key={l.id} className="card-2 min-w-0 px-3 py-2.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 break-words font-medium text-[var(--text)]">{l.title}</div>
            <div className="tabular shrink-0 text-right font-semibold">{money(l.valueMinor)}</div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
            <Reason l={l} />
            <span className="tabular">{l.quantity} шт<Undone l={l} /></span>
            {l.orderShortId && <span>заказ #{l.orderShortId}</span>}
          </div>
          {l.note && <div className="mt-1 break-words text-[12.5px] text-[var(--text-muted)]">{l.note}</div>}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-faint)]">
            <span>
              {formatDateTime(l.createdAt)}
              {l.adminName ? ` · ${l.adminName}` : ""}
            </span>
            <RestoreButton l={l} onClick={() => onRestore(l)} />
          </div>
        </div>
      ))}
    </div>
  );
}
