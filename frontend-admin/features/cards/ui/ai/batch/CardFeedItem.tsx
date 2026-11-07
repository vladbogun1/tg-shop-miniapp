"use client";

import { useAiJob, type AiBatchRow, type ReviewField } from "@/features/ai";
import { useBrandsQuery } from "@/features/catalog";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useMemo } from "react";
import { newBrandOf } from "../../../model/ai-card";
import { defaultPhotos } from "../../../model/selection";
import { removedByReplace } from "../../../model/spec-replace";
import { useCardItems, useCardSchema } from "../../../queries";
import { useCardSubject } from "../card-subject";
import { computeCardAiReview } from "../use-card-ai-review";

interface FeedCardProps {
  title: string;
  rows: ReviewField[];
  initial: ReadonlySet<string>;
  problem?: string | null;
  /** Сколько фото из ответа отмечено по умолчанию — «Принять» их загрузит. */
  photos?: number;
  /** Бренд из ответа, которого нет в каталоге: «Принять» его не запишет. */
  newBrand?: string | null;
  /** «Заменить характеристики целиком» включено: что удалится. */
  removed?: string[];
}

/** Карточка ленты: название и что «Принять» запишет (только то, что принимается по умолчанию), плюс фото и оговорки. */
export function FeedCard({ title, rows, initial, problem, photos = 0, newBrand, removed = [] }: FeedCardProps) {
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
      {photos > 0 && (
        <p className="text-[var(--text-muted)]" data-testid="feed-photos">
          Фото из ответа: {photos} — загрузятся после «Принять»
        </p>
      )}
      {newBrand && (
        <p className="break-words text-[var(--warn)]" data-testid="feed-new-brand">
          Бренда «{newBrand}» нет в каталоге — «Принять» его не запишет. Создать или выбрать существующий — в «Править».
        </p>
      )}
      {removed.length > 0 && (
        <p className="break-words text-[var(--danger-ink)]" data-testid="feed-removed">
          Удалит характеристики: {removed.join(", ")}
        </p>
      )}
      {problem && <p className="text-[var(--warn)]">{problem}</p>}
    </div>
  );
}

/** Карточка ленты пакета ИИ: разбор ответа задачи по свежей карточке. */
export function CardFeedItem({ row, replace = false }: { row: AiBatchRow; replace?: boolean }) {
  const job = useAiJob(row.id);
  const subject = useCardSubject(row.subjectId);
  const all = useCardItems();
  const schema = useCardSchema();
  const brandList = useBrandsQuery().data;
  const brands = useMemo(() => brandList?.map((b) => b.name), [brandList]);
  if (job.isLoading || subject.loading) return <CenterSpinner label="Загрузка…" />;
  const data = computeCardAiReview(job.data, subject.item, schema.data, all.data, brands);
  const r = data.review;
  return (
    <FeedCard
      title={subject.item?.title ?? row.subjectId}
      rows={data.rows}
      initial={data.initial}
      problem={data.problems[0]}
      photos={r ? defaultPhotos(r).length : 0}
      newBrand={r ? newBrandOf(r, brands) : null}
      removed={r && replace ? removedByReplace(r, schema.data).map((x) => x.label) : []}
    />
  );
}
