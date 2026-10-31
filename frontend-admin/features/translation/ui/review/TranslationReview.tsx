"use client";

/**
 * «Переводы» → просмотр по одному. The Russian original and the translations side by side; for an
 * outdated translation — what changed in the original; edit in place; «Принять и дальше» / «Пропустить».
 * Состояние и клавиши — `use-review-session.tsx`.
 */
import { cn } from "@/lib/cn";
import type { TrLocale } from "../../model/types";
import type { WorkSet } from "../../model/workset";
import { LangPanel } from "./LangPanel";
import { OriginalPanel } from "./OriginalPanel";
import { Context, FinishedCard, GoneCard, ReviewActions, ReviewHeader } from "./ReviewParts";
import { useReviewSession } from "./use-review-session";

export function TranslationReview({
  ws,
  queue,
  start,
  langs,
  title,
  onClose,
}: {
  ws: WorkSet;
  /** Source hashes of the texts, in the order of the list. */
  queue: string[];
  start: number;
  langs: TrLocale[];
  /** Name of the tab the queue came from. */
  title: string;
  onClose: () => void;
}) {
  const r = useReviewSession({ ws, queue, start, langs, onClose });
  const { s } = r;
  const isLast = r.index >= queue.length - 1;

  return (
    <div ref={r.topRef} className="scroll-mt-4">
      <ReviewHeader
        title={title}
        index={r.index}
        total={queue.length}
        finished={r.finished}
        busy={r.busy}
        onLeave={() => void r.leave()}
        onGo={(i) => void r.go(i)}
      />

      {r.finished ? (
        <FinishedCard total={queue.length} title={title} onClose={onClose} onRestart={() => r.show(0)} />
      ) : !s ? (
        <GoneCard onNext={r.advance} />
      ) : (
        <div className="card p-4 sm:p-5">
          <Context s={s} />
          <div className={cn("grid gap-4 lg:grid-cols-2", langs.length === 2 && "2xl:grid-cols-3")}>
            <OriginalPanel s={s} diff={r.diff} prev={r.prev} anyStale={r.anyStale} showCurrent={r.showCurrent} onShowCurrent={r.setShowCurrent} />
            {langs.map((l) => (
              <LangPanel
                key={l}
                l={l}
                s={s}
                value={r.value(l)}
                edited={r.edited(l)}
                busy={r.busy}
                fieldRef={(el) => {
                  r.fieldRefs.current[l] = el;
                }}
                onChange={(text) => r.setText(l, text)}
                onRevert={() => r.setText(l, undefined)}
                onRemove={() => void r.remove(l)}
              />
            ))}
          </div>
        </div>
      )}

      {!r.finished && s && (
        <ReviewActions label={r.primaryLabel} busy={r.busy} isLast={isLast} onAccept={() => void r.accept()} onSkip={() => void r.go(r.index + 1)} />
      )}
    </div>
  );
}
