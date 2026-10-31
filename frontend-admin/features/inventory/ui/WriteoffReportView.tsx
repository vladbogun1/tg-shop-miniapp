"use client";

import { PackageMinus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { RestoreWriteoffModal } from "@/features/returns";
import { money } from "@/lib/money";
import type { WriteoffLine, WriteoffReport } from "../model/types";
import { WRITEOFF_LABEL, leftOf } from "../model/writeoffs";
import { useInvalidateWriteoffs } from "../queries";
import { WriteoffCards } from "./WriteoffCards";
import { WriteoffTable } from "./WriteoffTable";

/** Плитки итогов, список списаний и окно «Вернуть на склад». */
export function WriteoffReportView({ data }: { data: WriteoffReport }) {
  const invalidate = useInvalidateWriteoffs();
  const [restoring, setRestoring] = useState<{ id: number; title: string; left: number } | null>(null);
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

      {data.lines.length === 0 ? (
        <EmptyState icon={PackageMinus} title="Списаний за период нет" description="Здесь появятся строки, когда остаток товара уменьшат вручную или примут возврат с браком." />
      ) : (
        <>
          <WriteoffTable lines={data.lines} onRestore={restore} />
          <WriteoffCards lines={data.lines} onRestore={restore} />
        </>
      )}
      <RestoreWriteoffModal writeoff={restoring} onClose={() => setRestoring(null)} onDone={invalidate} />
    </>
  );
}
