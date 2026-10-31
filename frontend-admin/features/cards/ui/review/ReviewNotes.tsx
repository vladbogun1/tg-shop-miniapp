"use client";

import { ExternalLink, MessageSquareText, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CardItem } from "../../model/item";
import type { CardMeta, CardReviewData } from "../../model";
import { fieldsWord, missingLabels } from "../../model/view";
import type { CardSchema } from "../../model/schema";
import { fmtDate, host } from "../shared";
import { Section } from "./parts";


/** Предупреждение о пустых обязательных характеристиках. */
export function MissingNotice({ cur, schema }: { cur: CardItem; schema: CardSchema | undefined }) {
  const missing = cur.missingRequired ?? [];
  if (missing.length === 0) return null;
  return (
    <div className="flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_9%,transparent)] p-3 text-[13px] leading-relaxed text-[var(--text)]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <div>
        <b>
          Нет {missing.length} обязательных {fieldsWord(missing.length)}:
        </b>{" "}
        {missingLabels(schema, cur).join(", ")}. Заполните ниже («Править») или в редакторе — без них карточка неполная.
      </div>
    </div>
  );
}

/** Источники и заметки ИИ из последнего импорта. */
export function SourcesNotes({ meta }: { meta: CardMeta }) {
  if (!((meta.sources?.length ?? 0) > 0 || meta.notes)) return null;
  return (
    <Section title="Источники и заметки ИИ">
      <div className="grid gap-3 sm:grid-cols-2">
        {(meta.sources?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-1">
            {meta.sources!.map((s, i) => (
              <li key={i} className="min-w-0">
                <a
                  href={s}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={s}
                  className="focusable inline-flex max-w-full items-center gap-1 rounded-[var(--r-sm)] text-[12.5px] font-semibold text-[var(--info)] hover:underline"
                >
                  <span className="truncate">{host(s)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {meta.notes && (
          <div className="flex gap-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            <span className="whitespace-pre-wrap">{meta.notes}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Кто и когда проверил, когда был импорт ИИ. */
export function ReviewedLine({ data, meta }: { data: CardReviewData | undefined; meta: CardMeta }) {
  const reviewedAt = fmtDate(data?.reviewedAt ?? meta.reviewedAt);
  const importedAt = fmtDate(data?.importedAt ?? meta.importedAt);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--text-faint)]">
      <span>
        {reviewedAt ? (
          <>
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--ok)]" />
            Проверил{data?.reviewedByName ? <b className="font-semibold text-[var(--text-muted)]"> {data.reviewedByName}</b> : ""} · {reviewedAt}
          </>
        ) : (
          "Ещё не проверена"
        )}
      </span>
      {importedAt && (
        <span>
          Импорт ИИ {importedAt}
          {meta.model ? ` · ${meta.model}` : ""}
          {data?.last?.editedAt ? ` · правки ${fmtDate(data.last.editedAt)}` : ""}
        </span>
      )}
    </div>
  );
}
