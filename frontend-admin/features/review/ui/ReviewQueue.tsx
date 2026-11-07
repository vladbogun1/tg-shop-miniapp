"use client";

import { cn } from "@/lib/cn";
import { timeAgo } from "@shop/core/time";
import { REVIEW_STATUS_LABEL } from "../model/filters";
import type { AdminReview } from "../model/types";
import { Stars } from "./ReviewStars";

/** Одна строка очереди: инициал, подпись, звёзды, время, начало текста, значки «черновик ответа» / «есть ответ» / статус. */
function QueueRow({
  review: r,
  selected,
  draft,
  showStatus,
  onSelect,
}: {
  review: AdminReview;
  selected: boolean;
  draft: boolean;
  showStatus: boolean;
  onSelect: () => void;
}) {
  const author = r.author?.trim() || r.customerName?.trim() || "Покупатель";
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "focusable flex min-h-14 w-full min-w-0 items-start gap-3 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition-colors",
          selected ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-hover)]"
        )}
      >
        <span
          aria-hidden
          className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[14px] font-bold uppercase text-[var(--accent-hi)]"
        >
          {author.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <b className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--text)]">{author}</b>
            <Stars rating={r.rating} size="sm" className="shrink-0" />
            <span className="ml-auto shrink-0 text-[11.5px] text-[var(--text-faint)]">{timeAgo(r.createdAt)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-[var(--text-muted)]">{r.text || "Без текста"}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-faint)]">
            {r.productTitle || "Товар"}
            {showStatus ? ` · ${REVIEW_STATUS_LABEL[r.status]}` : ""}
            {r.adminReply ? " · есть ответ" : ""}
            {draft ? <span className="text-[var(--warn)]"> · ● черновик ответа</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ReviewQueue({
  items,
  selectedId,
  showStatus,
  unsaved,
  onSelect,
}: {
  items: AdminReview[];
  selectedId: number | null;
  showStatus: boolean;
  /** id отзывов с несохранённым ответом. */
  unsaved: Set<number>;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Очередь отзывов">
      {items.map((r) => (
        <QueueRow key={r.id} review={r} selected={r.id === selectedId} draft={unsaved.has(r.id)} showStatus={showStatus} onSelect={() => onSelect(r.id)} />
      ))}
    </ul>
  );
}
