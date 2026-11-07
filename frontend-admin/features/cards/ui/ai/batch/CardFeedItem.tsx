"use client";

import { useAiJob, type AiBatchRow, type ReviewField } from "@/features/ai";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useCardItems, useCardSchema } from "../../../queries";
import { useCardSubject } from "../card-subject";
import { computeCardAiReview } from "../use-card-ai-review";

/** Карточка ленты: название и что ответ предлагает записать (только то, что принимается по умолчанию). */
export function FeedCard({ title, rows, initial, problem }: { title: string; rows: ReviewField[]; initial: ReadonlySet<string>; problem?: string | null }) {
  const shown = rows.filter((r) => initial.has(r.key));
  return (
    <div className="flex min-w-0 flex-col gap-2 text-[13px]">
      <div className="break-words text-[15px] font-semibold text-[var(--ink)]">{title}</div>
      {shown.length === 0 ? (
        <p className="text-[var(--text-muted)]">Ничего не принимается по умолчанию. Откройте «Править», чтобы посмотреть предложения.</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="feed-fields">
          {shown.map((r) => (
            <li key={r.key} className="flex min-w-0 flex-wrap gap-x-2">
              <span className="text-[var(--text-muted)]">{r.label}</span>
              <span className="min-w-0 break-words font-medium text-[var(--text)]">{r.after}</span>
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="text-[var(--warn)]">{problem}</p>}
    </div>
  );
}

/** Карточка ленты пакета ИИ: разбор ответа задачи по свежей карточке. */
export function CardFeedItem({ row }: { row: AiBatchRow }) {
  const job = useAiJob(row.id);
  const subject = useCardSubject(row.subjectId);
  const all = useCardItems();
  const schema = useCardSchema();
  if (job.isLoading || subject.loading) return <CenterSpinner label="Загрузка…" />;
  const data = computeCardAiReview(job.data, subject.item, schema.data, all.data);
  return <FeedCard title={subject.item?.title ?? row.subjectId} rows={data.rows} initial={data.initial} problem={data.problems[0]} />;
}
