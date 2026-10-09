"use client";

/**
 * «Переводы»: the list of one tab. One row = one unique Russian text (shared descriptions once);
 * a click opens it in the review (TranslationReview) at that position of the queue.
 */
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { TrLocale } from "@/lib/api";
import type { UniqueString } from "@/lib/translation-check";
import { currentText, langState, placeOf } from "@/lib/translation-queue";
import { Button } from "@/components/ui/Button";
import { KindBadge, StateChip } from "@/components/translations/shared";

const PAGE = 50;

export function TranslationQueue({
  strings,
  langs,
  onOpen,
}: {
  strings: UniqueString[];
  langs: TrLocale[];
  onOpen: (index: number) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {strings.slice(0, limit).map((s, i) => {
          const f = s.fields[0];
          const others = new Set(s.fields.map((x) => x.productId ?? `${x.entityType}:${x.entityId}`)).size - 1;
          // The language that needs the most work is the one previewed.
          const shown = [...langs].sort((a, b) => order(langState(s, a)) - order(langState(s, b)))[0];
          const tr = currentText(s, shown);
          return (
            <li key={s.sourceHash}>
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="card group flex w-full items-stretch gap-3 p-3 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <KindBadge kindKey={s.kindKey} />
                    <span className="min-w-0 max-w-full truncate text-[12px] font-semibold text-[var(--text-muted)]">
                      {placeOf(f)}
                      {others > 0 && <span className="font-normal text-[var(--text-faint)]"> и ещё {others}</span>}
                    </span>
                    <span className="ml-auto flex flex-wrap gap-1">
                      {langs.map((l) => (
                        <StateChip key={l} lang={l} state={langState(s, l)} />
                      ))}
                    </span>
                  </div>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <p className="line-clamp-2 whitespace-pre-line break-words text-[13px] leading-snug text-[var(--text)]">{s.source}</p>
                    <p className="line-clamp-2 whitespace-pre-line break-words text-[13px] leading-snug text-[var(--text-muted)]">
                      {tr ? (
                        <>
                          <span className="font-display text-[10.5px] font-bold uppercase text-[var(--text-faint)]">{shown} </span>
                          {tr}
                        </>
                      ) : (
                        <span className="italic text-[var(--text-faint)]">{shown.toUpperCase()}: перевода нет</span>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 self-center text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent-hi)]" />
              </button>
            </li>
          );
        })}
      </ul>
      {strings.length > limit && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setLimit(limit + PAGE * 2)}>
            Показать ещё ({strings.length - limit})
          </Button>
        </div>
      )}
    </div>
  );
}

function order(b: string): number {
  return b === "missing" ? 0 : b === "stale" ? 1 : b === "review" ? 2 : 3;
}
