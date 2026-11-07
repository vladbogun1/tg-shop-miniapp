"use client";

/**
 * «Принять» в ленте быстрой проверки — одно для пакета ИИ и для ручного пакета: запись с выбором по умолчанию в
 * журнале применений, отмеченные фото — в общую очередь загрузки, заметки записи — в итог пакета, «Отменить» —
 * отмена этого применения (карточка вернётся в ленту). «Заменить характеристики целиком» — переключатель ленты,
 * по умолчанию выключен; включён — действует на каждое следующее «Принять».
 */
import { invalidateAfterBatch, useUndoApplication, type AiBatchRow, type FeedAccepted } from "@/features/ai";
import { useBrandsQuery } from "@/features/catalog";
import { errorMessage } from "@shop/core/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { CardSchema } from "../../../model/schema";
import { invalidateCards } from "../../../queries";
import { usePhotoImport } from "../../photos/use-photo-import";
import { addBatchNotes } from "./batch-notes";
import { acceptRow } from "./card-batch-apply";

export function useFeedAccept(a: { batchId: number | null; schema: CardSchema | undefined; onChanged?: () => void }) {
  const qc = useQueryClient();
  const brandList = useBrandsQuery().data;
  const brands = useMemo(() => brandList?.map((b) => b.name), [brandList]);
  const photos = usePhotoImport();
  const undo = useUndoApplication();
  const [replace, setReplace] = useState(false);

  const changed = () => {
    invalidateCards(qc);
    invalidateAfterBatch.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    a.onChanged?.();
  };

  async function accept(row: AiBatchRow): Promise<FeedAccepted> {
    const done = await acceptRow(row, { schema: a.schema, brands, replace }).catch((e: unknown) => {
      const text = errorMessage(e, undefined, "Не удалось принять карточку");
      if (a.batchId !== null) addBatchNotes(qc, a.batchId, [{ jobId: row.id, productId: row.subjectId, kind: "error", text }]);
      throw e;
    });
    if (done.photos.length) photos.add(done.photos);
    if (a.batchId !== null) addBatchNotes(qc, a.batchId, done.notes);
    changed();
    return {
      label: done.title,
      undo: async () => {
        await undo.mutateAsync(done.applyId);
        changed();
      },
    };
  }

  return { accept, replace, setReplace, photos };
}
