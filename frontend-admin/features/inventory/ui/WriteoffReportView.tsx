"use client";

import { PackageMinus } from "lucide-react";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { RestoreModal } from "../model/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { money } from "@/lib/money";
import type { WriteoffLine, WriteoffReport } from "../model/types";
import { WRITEOFF_LABEL, WRITEOFF_REASONS, leftOf } from "../model/writeoffs";
import { useInvalidateWriteoffs } from "../queries";
import { WriteoffCards } from "./WriteoffCards";
import { WriteoffTable } from "./WriteoffTable";

/** Плитки итогов, список списаний и окно «Вернуть на склад». */
export function WriteoffReportView({ data, RestoreWriteoffModal }: { data: WriteoffReport; RestoreWriteoffModal: RestoreModal }) {
  const invalidate = useInvalidateWriteoffs();
  const [restoring, setRestoring] = useState<{ id: number; title: string; left: number } | null>(null);
  const [reason, setReason] = useState<string>("");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const lines = data.lines.filter(
    (l) =>
      (!reason || l.reason === reason) &&
      (!needle || l.title.toLowerCase().includes(needle) || (l.note ?? "").toLowerCase().includes(needle) || (l.orderShortId ?? "").toString().includes(needle)),
  );
  const restore = (l: WriteoffLine) => setRestoring({ id: l.id, title: l.title, left: leftOf(l) });
  const tiles = [
    { label: "Всего списано", value: `${data.totalUnits} шт`, accent: true },
    { label: "На сумму", value: money(data.totalValueMinor), accent: true },
    ...data.byReason
      .filter((t) => t.lines > 0)
      .map((t) => ({ label: WRITEOFF_LABEL[t.reason] ?? t.reason, value: `${t.units} шт · ${money(t.valueMinor)}`, accent: false })),
  ];
  return (
    <>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className="tabular mt-1 break-words font-display text-[16px] font-bold leading-tight text-[var(--ink)]">{t.value}</div>
          </div>
        ))}
      </div>

      {data.lines.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Товар, заметка, номер заказа"
              aria-label="Поиск по списаниям"
              className="h-[42px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] pl-9 pr-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
            />
          </label>
          <div className="thin-scroll flex max-w-full gap-1.5 overflow-x-auto">
            {[{ value: "", label: "Все причины" }, ...WRITEOFF_REASONS].map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                aria-pressed={reason === r.value}
                className={cn(
                  "min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold lg:min-h-[34px]",
                  reason === r.value
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-[var(--line)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {data.lines.length === 0 ? (
        <EmptyState icon={PackageMinus} title="Списаний за период нет" description="Здесь появятся строки, когда остаток товара уменьшат вручную или примут возврат с браком." />
      ) : (
        <>
          <WriteoffTable lines={lines} onRestore={restore} />
          <WriteoffCards lines={lines} onRestore={restore} />
          {lines.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">Ничего не нашли — поменяйте поиск или причину.</p>}
        </>
      )}
      <RestoreWriteoffModal writeoff={restoring} onClose={() => setRestoring(null)} onDone={invalidate} />
    </>
  );
}
