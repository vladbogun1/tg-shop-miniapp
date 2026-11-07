"use client";

/**
 * Применение проверенного ответа ИИ по карточке — одно для встроенного ИИ и ручного пути через ChatGPT: тот же
 * импорт карточки (`useCompletionSave`: характеристики, тексты, переводы, источники и заметки, модель, статус
 * «Готово»/«Проверить», «выложить»), затем фото по ссылкам (`usePhotoImport`, как у мастера). Счётчики исхода
 * (принято / с правками / отклонено / под замком) уходят вызывающему: встроенный ИИ отчитывается по задаче, ручной
 * путь ставит метку MANUAL.
 */
import { outcomeCounts, type OutcomeCounts, type ReviewField } from "@/features/ai";
import { useRef, useState } from "react";
import { toProductSel } from "../../model/ai-card";
import type { PublishProblem } from "../../model/completion";
import type { CardItem } from "../../model/item";
import type { PhotoJob } from "../../model/photos";
import { autoReady, buildImportItem } from "../../model/selection";
import type { ProductReview } from "../../model/types";
import { priceToMinor } from "../completion/use-card-completion";
import { useCompletionSave, type CardCompletionResult } from "../completion/use-completion-save";
import { usePhotoImport } from "../wizard/use-photo-import";

export interface ReviewApplyArgs {
  item: CardItem;
  /** Разбор с правками человека. */
  review: ProductReview | null;
  rows: ReviewField[];
  selected: ReadonlySet<string>;
  translations: boolean;
  publish: boolean;
  photos: string[];
  /** Ручной выбор статуса; null — автоматически (`autoReady`). */
  markReady: boolean | null;
  /** Модель, которую назвал человек (ручной путь); ответ ИИ может назвать свою — она важнее. */
  model?: string;
  onApplied: (counts: OutcomeCounts) => void;
  onSaved?: (published: boolean) => void;
  /** Запись прошла и закрыть можно (выложено или выкладывать не просили); пока грузятся фото — не зовётся. */
  onClose?: (result: CardCompletionResult) => void;
}

export function useCardReviewApply(a: ReviewApplyArgs) {
  const photos = usePhotoImport();
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [price, setPrice] = useState("");
  const [applied, setApplied] = useState(false);
  const counts = useRef<OutcomeCounts>({ applied: 0, rejected: 0, edited: 0, ignoredLocked: 0 });
  const photoJobs = useRef<PhotoJob[]>([]);
  const wantsPublish = a.item.active !== true && a.publish;

  const finish = () => {
    setApplied(true);
    a.onApplied(counts.current);
    void photos.run(photoJobs.current);
  };
  const save = useCompletionSave({
    onClose: (r) => {
      if (!photoJobs.current.length) a.onClose?.(r);
    },
    onProblem: setProblem,
    onSaved: (published) => {
      finish();
      a.onSaved?.(published);
    },
    onPublished: () => undefined,
  });

  const sel = a.review ? toProductSel(a.review, a.selected, { translations: a.translations, photos: a.photos }) : null;
  const sure = !!a.review && !!sel && autoReady(a.review, sel);

  function apply() {
    if (!a.review || !sel || save.saving || applied) return;
    const payload = buildImportItem(a.review, sel, { markReady: a.markReady ?? sure, model: a.model, publish: wantsPublish });
    counts.current = outcomeCounts(a.rows, a.selected);
    photoJobs.current = sel.photos.map((url) => ({ productId: a.item.id, title: a.item.title, url }));
    setProblem(null);
    if (payload) save.save.mutate({ payload, publish: wantsPublish, item: a.item });
    else if (photoJobs.current.length) finish();
  }

  const minor = priceToMinor(price);
  return {
    apply,
    saving: save.saving,
    problem,
    price,
    setPrice,
    priceMinor: minor,
    savePrice: () => minor !== null && save.savePrice.mutate({ item: a.item, priceMinor: minor }),
    applied,
    sure,
    photoImport: photos,
  };
}

export type CardReviewApply = ReturnType<typeof useCardReviewApply>;
