"use client";

import { editText } from "../../model";
import { AUTO_READY_OVERALL, RED_FIELD } from "../../model/selection";
import { ReviewCard } from "../ReviewCard";
import type { CardCompletion } from "./use-card-completion";

/** Шаг 3: проверка разобранного ответа и выбор, что сохранять. */
export function ReviewStep({ c }: { c: CardCompletion }) {
  const { review, sel, schema, markReady, markReadyOverride, setMarkReadyOverride, sure, setSel, setReview, setAddOption } = c;
  if (!review || !sel || !schema) return null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="field-label">3 · Проверка</span>
        <label
          className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--text-muted)]"
          title={`Автоматически: «Готово», если ИИ уверена на ${AUTO_READY_OVERALL} % и больше и среди сохраняемых полей нет догадок (ниже ${RED_FIELD} %)`}
        >
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={markReady} onChange={(e) => setMarkReadyOverride(e.target.checked)} />
          {markReady ? "Сразу в «Готово»" : "Уйдёт в «Проверить»"}
          {markReadyOverride === null && <span className="font-normal text-[var(--text-faint)]">· {sure ? "ИИ уверена" : "ИИ не уверена"}</span>}
        </label>
      </div>
      <ReviewCard
        review={review}
        schema={schema}
        sel={sel}
        onSel={(patch) => setSel({ ...sel, ...patch })}
        onAddOption={setAddOption}
        onEditText={(field, lang, value) => setReview(editText(review, field, lang, value))}
      />
    </div>
  );
}
