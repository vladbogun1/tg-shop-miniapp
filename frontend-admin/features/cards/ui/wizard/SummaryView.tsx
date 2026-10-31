"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { reasonRu, translationTotals } from "../../model";
import type { ImportSummary } from "./use-answer-review";

/** Итог записи: сколько сохранено, отклонено, переводов; список отказов и отброшенных полей. */
export function SummaryView({ summary }: { summary: ImportSummary }) {
  const r = summary.result;
  const t = (id: string) => summary.titles.get(id) ?? id.slice(0, 8);
  const tr = translationTotals(r?.items ?? []);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]">
      <div className="section-title mb-2 !text-[12px]">Итог сохранения</div>
      {summary.error && <div className="font-semibold text-[var(--danger-ink)]">✕ {summary.error}</div>}
      {r && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok">сохранено {r.applied}</Badge>
            {r.rejected.length > 0 && <Badge tone="danger">отклонено {r.rejected.length}</Badge>}
            {r.issues.length > 0 && <Badge tone="warn">отброшено полей {r.issues.length}</Badge>}
            {r.createdBrands.length > 0 && <Badge tone="info">новые бренды: {r.createdBrands.join(", ")}</Badge>}
            {tr.uk + tr.en > 0 && (
              <Badge tone="ok">
                переводов: UA {tr.uk} · EN {tr.en}
              </Badge>
            )}
            {tr.manual > 0 && <Badge tone="warn">ручные переводы не перезаписаны: {tr.manual}</Badge>}
          </div>
          {r.rejected.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-[12px] font-semibold text-[var(--danger-ink)]">
              {r.rejected.map((x, i) => (
                <li key={i}>
                  ✕ {t(x.productId)} — {reasonRu(x.reason)}
                </li>
              ))}
            </ul>
          )}
          {r.issues.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">Сервер отбросил поля: {r.issues.length}</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[var(--text-muted)]">
                {r.issues.slice(0, 200).map((x, i) => (
                  <li key={i}>
                    {t(x.productId)} · <span className="font-mono">{x.key}</span> — {reasonRu(x.reason)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </motion.div>
  );
}
