"use client";

/**
 * Проверка ответа ИИ по одной карточке — один экран для встроенного ИИ (`/cards/ai-review/[jobId]`) и для ручного
 * пути через ChatGPT (внутри окна, `embedded`). Здесь всё, что одинаково: строки из разбора с правками человека,
 * выбор, фото, статус, переводы, «выложить», новые опции схемы, применение и цена, если без неё не выложить.
 * Что разное, приходит снаружи: плашки (конфликт правок у задачи), пункты «⋯», куда отчитаться об исходе.
 */
import { AiReview, type AiMenuItem, type OutcomeCounts, outcomeCounts } from "@/features/ai";
import { useBrandsQuery } from "@/features/catalog";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { confirmedSpecKeys, initialKeys, reselectAfterCategory, reviewRows, type FieldContext } from "../../model/ai-card";
import type { Proposal } from "../../model";
import type { CardItem } from "../../model/item";
import type { ProductReview } from "../../model/types";
import type { ReviewChoices } from "../../model/review-choice";
import { invalidateCards, useCardSchema } from "../../queries";
import { AddOptionModal } from "../AddOptionModal";
import { ProblemBox } from "../completion/ProblemBox";
import type { CardCompletionResult } from "../completion/use-completion-save";
import { CardReviewExtras } from "./CardReviewExtras";
import { useCardReviewApply } from "./use-card-review-apply";
import { useCardReviewDraft } from "./use-card-review-draft";

export interface CardReviewPanelProps {
  item: CardItem;
  /** Разбор ответа ИИ (без правок человека). */
  review: ProductReview;
  /** Конфликт правок и соседи по категории; держать стабильным (useMemo). */
  ctx: FieldContext;
  /** Товар только что создан: новое название включено сразу. */
  created: boolean;
  title: string;
  finishedAt?: string | null;
  model?: string;
  /** Итог уже известен снаружи (задачу разобрали раньше). */
  doneText?: string | null;
  embedded?: boolean;
  notices?: ReactNode;
  onBack: () => void;
  /** Пункты «⋯»; \`rejectCounts\` — исход «отклонено всё» по текущим строкам. */
  menu: (rejectCounts: () => OutcomeCounts) => AiMenuItem[];
  onApplied: (counts: OutcomeCounts) => void;
  onSaved?: (published: boolean) => void;
  onClose?: (result: CardCompletionResult) => void;
}

/** Категории и бренды каталога для выбора в проверке; пока что-то не загрузилось — категорию и бренд не правят. */
function useReviewChoices(): ReviewChoices | undefined {
  const schema = useCardSchema().data;
  const brands = useBrandsQuery().data;
  return useMemo(() => (schema && brands ? { schema, brands: brands.map((b) => b.name) } : undefined), [schema, brands]);
}

export function CardReviewPanel(p: CardReviewPanelProps) {
  const qc = useQueryClient();
  const choices = useReviewChoices();
  const draft = useCardReviewDraft(p.review, choices);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [translations, setTranslations] = useState(true);
  const [publish, setPublish] = useState(p.item.active !== true);
  const [addOption, setAddOption] = useState<Proposal | null>(null);

  const ctx = useMemo(() => ({ ...p.ctx, choices }), [p.ctx, choices]);
  const baseRows = useMemo(() => reviewRows(p.review, ctx), [p.review, ctx]);
  const initial = useMemo(
    () => initialKeys(p.review, baseRows, p.created),
    [baseRows, p.review, p.created],
  );
  const rows = useMemo(() => (draft.review ? reviewRows(draft.review, { ...ctx, edited: draft.edited }) : baseRows), [draft.review, draft.edited, ctx, baseRows]);
  const selected = picked ?? initial;

  const act = useCardReviewApply({
    item: p.item,
    review: draft.review,
    rows,
    selected,
    translations,
    publish,
    photos: draft.photos,
    markReady: draft.markReady,
    model: p.model,
    onApplied: p.onApplied,
    onSaved: p.onSaved,
    onClose: p.onClose,
  });
  const finished = act.applied || !!p.doneText;

  const edit = (key: string, value: string) => {
    const out = draft.edit(key, value);
    if (out.error !== null) return out.error;
    setPicked(key === "category" ? reselectAfterCategory(selected, reviewRows(out.review, ctx)) : new Set(selected).add(key));
    return null;
  };

  return (
    <>
      <AiReview
        finishedAt={p.finishedAt}
        title={p.title}
        fields={rows}
        selected={selected}
        onSelected={setPicked}
        onApply={act.apply}
        applying={act.saving}
        doneText={p.doneText ?? (act.applied ? "Результат применён" : null)}
        menu={p.menu(() => outcomeCounts(rows, new Set()))}
        onBack={p.onBack}
        onEdit={finished ? undefined : edit}
        applyNote={draft.photos.length ? `${draft.photos.length} фото` : null}
        embedded={p.embedded}
        notices={
          <>
            {p.notices}
            <ProblemBox problem={act.problem} price={act.price} setPrice={act.setPrice} priceOk={act.priceMinor !== null} saving={act.saving} onSavePrice={act.savePrice} />
          </>
        }
        extra={
          <CardReviewExtras
            item={p.item}
            review={draft.review ?? p.review}
            sel={act.sel}
            finished={finished}
            photos={draft.photos}
            setPhotos={draft.setPhotos}
            photoImport={act.photoImport}
            translations={translations}
            setTranslations={setTranslations}
            onEditTranslation={draft.editTranslation}
            publish={publish}
            setPublish={setPublish}
            markReady={draft.markReady}
            setMarkReady={draft.setMarkReady}
            sure={act.sure}
            confirmed={confirmedSpecKeys(draft.review ?? p.review).length}
            onAddOption={setAddOption}
          />
        }
      />
      {addOption && (
        <AddOptionModal
          proposal={addOption}
          onClose={() => setAddOption(null)}
          onAdded={() => {
            setAddOption(null);
            invalidateCards(qc, true);
          }}
        />
      )}
    </>
  );
}
