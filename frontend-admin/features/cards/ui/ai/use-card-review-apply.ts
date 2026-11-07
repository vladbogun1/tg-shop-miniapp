"use client";

/**
 * Применение проверенного ответа ИИ по карточке — одно для встроенного ИИ и ручного пути через ChatGPT: тот же
 * импорт карточки (`useCompletionSave`: характеристики и подтверждённые без изменений, тексты, переводы, источники
 * и заметки, модель, статус «Готово»/«Проверить», «выложить»), затем фото по ссылкам (`usePhotoImport`, как у
 * мастера). Счётчики исхода
 * (принято / с правками / отклонено / под замком) уходят вызывающему: встроенный ИИ отчитывается по задаче, ручной
 * путь ставит метку MANUAL.
 */
import { aiKeys, outcomeCounts, type OutcomeCounts, type ReviewField } from "@/features/ai";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toProductSel } from "../../model/ai-card";
import type { PublishProblem } from "../../model/completion";
import type { CardItem } from "../../model/item";
import type { PhotoJob } from "../../model/photos";
import { autoReady, buildImportItem } from "../../model/selection";
import { replacingImport } from "../../model/spec-replace";
import type { ProductReview } from "../../model/types";
import { priceToMinor } from "../completion/use-card-completion";
import { useCompletionSave, type CardCompletionResult } from "../completion/use-completion-save";
import { usePhotoImport } from "../photos/use-photo-import";

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
  /** «Заменить характеристики целиком»: чего нет в ответе, удалится. */
  replace: boolean;
  /** Задача ответа: запись идёт в журнал применений (отмена 24 часа); null — без журнала. */
  jobId: () => Promise<number | null>;
  onApplied: (counts: OutcomeCounts) => void;
  onSaved?: (published: boolean) => void;
  /** Запись прошла и закрыть можно (выложено или выкладывать не просили); пока грузятся фото — не зовётся. */
  onClose?: (result: CardCompletionResult) => void;
}

export function useCardReviewApply(a: ReviewApplyArgs) {
  const photos = usePhotoImport();
  const qc = useQueryClient();
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [price, setPrice] = useState("");
  const [applied, setApplied] = useState(false);
  const counts = useRef<OutcomeCounts>({ applied: 0, rejected: 0, edited: 0, ignoredLocked: 0 });
  const photoJobs = useRef<PhotoJob[]>([]);
  // Запись журнала применений: фото и «Сохранить цену и выложить» после записи — её шаги (отменятся вместе с ней).
  const applyId = useRef<number | null>(null);
  const wantsPublish = a.item.active !== true && a.publish;

  const finish = () => {
    setApplied(true);
    a.onApplied(counts.current);
    const id = applyId.current;
    // Фото — шаги того же применения: когда догрузятся, плашка «Отменить применение» перечитает, что вернётся.
    void photos.run(photoJobs.current.map((j) => ({ ...j, applyId: id }))).then(() => {
      if (id !== null) void qc.invalidateQueries({ queryKey: aiKeys.applyLiveAll() });
    });
  };
  const save = useCompletionSave({
    onClose: (r) => {
      if (!photoJobs.current.length) a.onClose?.(r);
    },
    onProblem: setProblem,
    onSaved: (published, id) => {
      applyId.current = id;
      finish();
      a.onSaved?.(published);
    },
    // «Сохранить цену и выложить» после записи: окно должно знать, что товар уже на витрине.
    onPublished: () => a.onSaved?.(true),
  });

  const sel = a.review ? toProductSel(a.review, a.selected, { translations: a.translations, photos: a.photos, confirmed: true }) : null;
  const sure = !!a.review && !!sel && autoReady(a.review, sel);

  function apply() {
    if (!a.review || !sel || save.saving || applied) return;
    const chosen = buildImportItem(a.review, sel, { markReady: a.markReady ?? sure, model: a.model, publish: wantsPublish });
    const payload = a.replace ? replacingImport(a.review, chosen) : chosen;
    counts.current = outcomeCounts(a.rows, a.selected);
    photoJobs.current = sel.photos.map((url) => ({ productId: a.item.id, title: a.item.title, url }));
    setProblem(null);
    applyId.current = null;
    if (payload) save.save.mutate({ payload, publish: wantsPublish, item: a.item, replaceSpecs: a.replace, jobId: a.jobId });
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
    savePrice: () => minor !== null && save.savePrice.mutate({ item: a.item, priceMinor: minor, applyId: applyId.current }),
    applied,
    sel,
    sure,
    photoImport: photos,
  };
}

export type CardReviewApply = ReturnType<typeof useCardReviewApply>;
