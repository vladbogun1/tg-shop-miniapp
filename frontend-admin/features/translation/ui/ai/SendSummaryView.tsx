"use client";

/** «Перевод через ИИ»: итог отправки — что сохранено, что отклонено и почему. */
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { REASON_RU, type SendSummary } from "../../model/send";
import { LOCALES } from "../../model/workset";

export function SendSummaryView({ summary }: { summary: SendSummary }) {
  const rejected = [
    ...(summary.import.uk?.rejected ?? []).map((r) => ({ ...r, l: "uk" })),
    ...(summary.import.en?.rejected ?? []).map((r) => ({ ...r, l: "en" })),
    ...summary.fixes.flatMap((f) => (f.result?.rejected ?? []).map((r) => ({ ...r, l: "ru" }))),
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]"
    >
      <div className="section-title mb-2 !text-[12px]">Итог отправки</div>
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((l) => {
          const r = summary.import[l];
          if (!r) return null;
          return (
            <div key={l} className="flex flex-wrap items-center gap-1.5">
              <span className="font-display font-bold uppercase">{l}:</span>
              <Badge tone="ok">сохранено {r.applied}</Badge>
              {r.skippedStale > 0 && <Badge tone="warn">устарело {r.skippedStale}</Badge>}
              {r.skippedManual > 0 && <Badge tone="warn">ручные {r.skippedManual}</Badge>}
              {r.notFound + r.invalid > 0 && <Badge tone="danger">отклонено {r.notFound + r.invalid}</Badge>}
            </div>
          );
        })}
        {summary.fixes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display font-bold uppercase">ru:</span>
            <Badge tone="ok">исправлено полей {summary.fixes.reduce((n, f) => n + (f.result?.updated ?? 0), 0)}</Badge>
            <Badge tone="ok">переводов {summary.fixes.reduce((n, f) => n + (f.result?.translationsApplied ?? 0), 0)}</Badge>
          </div>
        )}
      </div>
      {summary.importErrors.map((e, i) => (
        <div key={i} className="mt-2 font-semibold text-[var(--danger-ink)]">✕ {e}</div>
      ))}
      {summary.fixes.filter((f) => f.error).map((f) => (
        <div key={f.id} className="mt-2 font-semibold text-[var(--danger-ink)]">✕ правка {f.id}: {f.error}</div>
      ))}
      {rejected.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">Не сохранено: {rejected.length}</summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[12px] text-[var(--text-muted)]">
            {rejected.slice(0, 100).map((r, i) => (
              <li key={i}>
                {r.l} · {r.entityType}.{r.field} {r.entityId?.slice(0, 8)} — {REASON_RU[r.reason] ?? r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(summary.import.uk?.skippedManual || summary.import.en?.skippedManual) ? (
        <div className="mt-2 text-[12px] text-[var(--text-muted)]">
          Ручные переводы, сделанные для текущего текста, не перезаписываются — поправьте их в просмотре по одному.
        </div>
      ) : null}
    </motion.div>
  );
}
