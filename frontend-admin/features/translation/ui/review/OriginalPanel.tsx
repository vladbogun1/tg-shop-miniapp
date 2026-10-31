"use client";

/** Просмотр по одному: русский оригинал; у устаревшего перевода — «Что изменилось» / «Текущий текст». */
import { cn } from "@/lib/cn";
import type { DiffPart } from "../../model/diff";
import type { UniqueString } from "../../model/workset";
import { Diff, SourceText } from "../shared";

export function OriginalPanel({
  s,
  diff,
  prev,
  anyStale,
  showCurrent,
  onShowCurrent,
}: {
  s: UniqueString;
  diff: DiffPart[] | null;
  prev: string | null;
  anyStale: boolean;
  showCurrent: boolean;
  onShowCurrent: (v: boolean) => void;
}) {
  return (
    <section className="min-w-0 lg:row-span-2 2xl:row-span-1">
      <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-2">
        <span className="field-label !mb-0">Оригинал · RU</span>
        {diff && (
          <div className="ml-auto inline-flex rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-2)] p-0.5 text-[11px] font-semibold">
            {(
              [
                [false, "Что изменилось"],
                [true, "Текущий текст"],
              ] as const
            ).map(([cur, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => onShowCurrent(cur)}
                className={cn(
                  "rounded-[3px] px-2 py-0.5 transition-colors",
                  showCurrent === cur ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
        {diff && !showCurrent ? <Diff parts={diff} /> : <SourceText text={s.source} clamp={false} />}
      </div>
      {anyStale && (
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-faint)]">
          {diff
            ? "Оригинал изменили после перевода: зачёркнуто — как было, подсвечено — как стало."
            : prev
              ? "Оригинал изменили после перевода."
              : "Оригинал изменили после перевода; каким он был раньше, неизвестно — перевод старше этой функции. Сверьте перевод с текущим текстом."}
        </p>
      )}
    </section>
  );
}
