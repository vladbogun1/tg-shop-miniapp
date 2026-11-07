"use client";

import { batchReport, type AiBatch, type BatchReportLine } from "@/features/ai";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCardItems } from "../../../queries";
import { useBatchNotes, type BatchNote } from "./batch-notes";

type Titles = (productId: string) => string;

function Section({ title, tone, children, testId }: { title: string; tone?: "bad" | "warn"; children: ReactNode; testId: string }) {
  const color = tone === "bad" ? "text-[var(--danger-ink)]" : tone === "warn" ? "text-[var(--warn)]" : "text-[var(--ink)]";
  return (
    <section className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <div className={`text-[12.5px] font-semibold ${color}`}>{title}</div>
      <ul className="flex min-w-0 flex-col gap-0.5 text-[12.5px]">{children}</ul>
    </section>
  );
}

function Lines({ lines, titles }: { lines: BatchReportLine[]; titles: Titles }) {
  return (
    <>
      {lines.map((l) => (
        <li key={l.jobId} className="min-w-0 break-words">
          <Link href={`/cards/ai-review/${l.jobId}`} className="text-[var(--accent)] underline-offset-2 hover:underline">
            {titles(l.subjectId)}
          </Link>
          {l.why && <span className="text-[var(--text-muted)]"> — {l.why}</span>}
        </li>
      ))}
    </>
  );
}

function NoteLines({ notes, titles }: { notes: BatchNote[]; titles: Titles }) {
  return (
    <>
      {notes.map((n, i) => (
        <li key={`${n.jobId}-${i}`} className="min-w-0 break-words">
          <Link href={`/cards/ai-review/${n.jobId}`} className="text-[var(--accent)] underline-offset-2 hover:underline">
            {titles(n.productId)}
          </Link>
          <span className="text-[var(--text-muted)]"> — {n.text}</span>
        </li>
      ))}
    </>
  );
}

/**
 * Итог пакета карточек, как сводка прежнего мастера: сколько записано, отклонено, ждёт проверки, не получилось
 * (и почему), у ручного — оставшиеся без ответа; со ссылками на проверку каждой. Ниже — подробности записи этой
 * сессии: не записалось, сервер отбросил поля, заведены новые бренды.
 */
export function CardBatchReport({ batch, unanswered = [] }: { batch: AiBatch; unanswered?: string[] }) {
  const items = useCardItems().data;
  const notes = useBatchNotes(batch.id);
  const titles: Titles = (id) => items?.find((i) => i.id === id)?.title ?? id;
  const r = batchReport(batch.jobs);
  const by = (kind: BatchNote["kind"]) => notes.filter((n) => n.kind === kind);
  const errors = by("error");
  const dropped = by("dropped");
  const brands = by("brand");
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="batch-report">
      <p className="text-[13px] text-[var(--text)]" data-testid="batch-report-counts">
        Записано {r.written.length} · отклонено {r.rejected.length} · ждут проверки {r.waiting.length} · не получилось {r.failed.length}
        {unanswered.length > 0 && ` · без ответа ${unanswered.length}`}
        {r.running > 0 && ` · ещё в работе ${r.running}`}
      </p>
      {r.written.length > 0 && <Section title="Записано" testId="report-written"><Lines lines={r.written} titles={titles} /></Section>}
      {errors.length > 0 && <Section title="Не записалось" tone="bad" testId="report-errors"><NoteLines notes={errors} titles={titles} /></Section>}
      {r.failed.length > 0 && <Section title="Не получилось у ИИ" tone="bad" testId="report-failed"><Lines lines={r.failed} titles={titles} /></Section>}
      {r.rejected.length > 0 && <Section title="Отклонено" testId="report-rejected"><Lines lines={r.rejected} titles={titles} /></Section>}
      {r.waiting.length > 0 && <Section title="Ждут проверки" testId="report-waiting"><Lines lines={r.waiting} titles={titles} /></Section>}
      {unanswered.length > 0 && (
        <Section title="Без ответа (пропущены)" tone="warn" testId="report-unanswered">
          {unanswered.map((id) => (
            <li key={id} className="min-w-0 break-words text-[var(--text)]">{titles(id)}</li>
          ))}
        </Section>
      )}
      {dropped.length > 0 && <Section title="Сервер не принял поля" tone="warn" testId="report-dropped"><NoteLines notes={dropped} titles={titles} /></Section>}
      {brands.length > 0 && <Section title="Заведены новые бренды" testId="report-brands"><NoteLines notes={brands} titles={titles} /></Section>}
    </div>
  );
}
