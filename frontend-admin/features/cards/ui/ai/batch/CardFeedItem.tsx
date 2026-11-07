"use client";

import { useAiJob, type AiBatchRow } from "@/features/ai";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useCardItems, useCardSchema } from "../../../queries";
import { useCardSubject } from "../card-subject";
import { computeCardAiReview } from "../use-card-ai-review";

/** Карточка ленты: название и что ИИ предлагает записать (только то, что принимается по умолчанию). */
export function CardFeedItem({ row }: { row: AiBatchRow }) {
  const job = useAiJob(row.id);
  const subject = useCardSubject(row.subjectId);
  const all = useCardItems();
  const schema = useCardSchema();
  if (job.isLoading || subject.loading) return <CenterSpinner label="Загрузка…" />;
  const data = computeCardAiReview(job.data, subject.item, schema.data, all.data);
  const shown = data.rows.filter((r) => data.initial.has(r.key));
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="text-[15px] font-semibold text-[var(--ink)]">{subject.item?.title ?? row.subjectId}</div>
      {shown.length === 0 ? (
        <p className="text-[var(--text-muted)]">Ничего не принимается по умолчанию. Откройте «Править», чтобы посмотреть предложения.</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="feed-fields">
          {shown.map((r) => (
            <li key={r.key} className="flex flex-wrap gap-x-2">
              <span className="text-[var(--text-muted)]">{r.label}</span>
              <span className="min-w-0 break-words font-medium text-[var(--text)]">{r.after}</span>
            </li>
          ))}
        </ul>
      )}
      {data.problems.length > 0 && <p className="text-[var(--warn)]">{data.problems[0]}</p>}
    </div>
  );
}
