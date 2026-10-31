"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@shop/ui/admin-button";
import { editText } from "../../model";
import type { CardSchema } from "../../model/schema";
import { defaultSel, RED_FIELD } from "../../model/selection";
import { ReviewCard } from "../ReviewCard";
import { Step } from "../shared";
import { SaveBar } from "./SaveBar";
import { SummaryView } from "./SummaryView";
import type { AnswerReview, ReviewFilter } from "./use-answer-review";

/** Быстрые отметки над списком карточек. */
function BulkBar({ a }: { a: AnswerReview }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
      <Button size="sm" variant="outline" onClick={() => a.bulk("80")}>
        Только ≥ 80 %
      </Button>
      <Button size="sm" variant="outline" onClick={() => a.bulk("okwarn")}>
        Все зелёные и жёлтые
      </Button>
      <Button size="sm" variant="ghost" onClick={() => a.bulk("none")}>
        Снять все
      </Button>
      <span className="ml-auto text-[var(--text-muted)]">Поля с уверенностью ниже {RED_FIELD} % по умолчанию не отмечены. Ошибочные поля не сохраняются.</span>
    </div>
  );
}

function ReviewCards({ a, schema }: { a: AnswerReview; schema: CardSchema }) {
  const { visibleReviews, sel, patchSel, setAddOption, setReviews } = a;
  return (
    <div className="flex flex-col gap-3">
      {visibleReviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          schema={schema}
          sel={sel.get(r.id) ?? defaultSel(r)}
          onSel={(patch) => patchSel(r.id, patch)}
          onAddOption={setAddOption}
          onEditText={(field, lang, value) => setReviews((prev) => (prev ?? []).map((x) => (x.id === r.id ? editText(x, field, lang, value) : x)))}
        />
      ))}
    </div>
  );
}

/** Шаг 3: карточки проверки по товарам, быстрые отметки, панель сохранения и итог. */
export function WizardReview({ a, schema }: { a: AnswerReview; schema: CardSchema }) {
  const { reviews, counts, reviewFilter, setReviewFilter, summary } = a;
  if (!reviews) return null;
  return (
    <Step
      n={3}
      title="Проверка и сохранение"
      aside={
        <SegmentedControl<ReviewFilter>
          size="sm"
          value={reviewFilter}
          onChange={setReviewFilter}
          options={[
            { value: "all", label: "Все", count: reviews.length },
            { value: "ok", label: "Без замечаний", count: counts.ok },
            { value: "warn", label: "С замечаниями", count: counts.warn },
            { value: "error", label: "Ошибки", count: counts.error },
          ]}
        />
      }
    >
      {reviews.length === 0 ? (
        <div className="text-[13px] font-semibold text-[var(--text-faint)]">{summary ? "Всё сохранено." : "В ответе нет ни одного товара из списка."}</div>
      ) : (
        <>
          <BulkBar a={a} />
          <ReviewCards a={a} schema={schema} />
        </>
      )}
      <SaveBar a={a} />
      {summary && <SummaryView summary={summary} />}
    </Step>
  );
}
