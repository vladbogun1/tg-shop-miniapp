"use client";

import { aiApi, AcceptSafeDialog, invalidateAfterBatch, type AiBatch, type AiBatchRow, type AiSafeApplied } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cardsApi } from "../../../api";
import { cardsKeys } from "../../../keys";
import type { CardItem } from "../../../model/item";
import type { CardSchema } from "../../../model/schema";
import { invalidateCards } from "../../../queries";
import { applySafe, planOf, safeKeysOf } from "./card-batch-apply";

/**
 * Задачи пакета, к которым применимо «безопасное»: готовы, не решены и с данными из интернета — ИИ искал сам или
 * ответ принесли из ChatGPT вручную (ручной пакет).
 */
const eligibleRows = (b: AiBatch): AiBatchRow[] => b.jobs.filter((r) => r.status === "DONE" && !r.outcome && (r.searched || b.path === "MANUAL"));

/** Сколько карточек и полей «безопасно» заполнится по кэшу карточек: числа для окна подтверждения. */
function useSafeCount(batch: AiBatch, items: CardItem[] | undefined, schema: CardSchema | undefined) {
  return useQuery({
    queryKey: cardsKeys.aiSafeCount(batch.id, batch.ready),
    enabled: !!items && !!schema && batch.ready > 0,
    staleTime: QUERY_PRESETS.live.staleTime,
    queryFn: async () => {
      let cards = 0;
      let fields = 0;
      for (const row of eligibleRows(batch)) {
        const job = await aiApi.job(row.id);
        const plan = planOf(job, items?.find((i) => i.id === row.subjectId) ?? null, schema, items);
        const n = plan ? safeKeysOf(plan).length : 0;
        if (n > 0) cards += 1;
        fields += n;
      }
      return { cards, fields };
    },
  });
}

/** Одна карточка «безопасно» по свежим данным; сбой одной карточки не останавливает остальные (она ждёт проверки). */
async function applyRow(row: AiBatchRow, schema: CardSchema): Promise<AiSafeApplied | null> {
  try {
    const [job, found] = await Promise.all([aiApi.job(row.id), cardsApi.export("all", [row.subjectId])]);
    const plan = planOf(job, found[0] ?? null, schema, undefined);
    return plan && safeKeysOf(plan).length > 0 ? await applySafe(plan) : null;
  } catch {
    return null;
  }
}

export function SafeAcceptButton({
  batch,
  items,
  schema,
  onChanged,
}: {
  batch: AiBatch;
  items: CardItem[] | undefined;
  schema: CardSchema | undefined;
  /** После записи и после закрытия окна (там же «Отменить применение»): у ручного пакета свой запрос. */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  // Окно держит свои числа: после записи у пакета не остаётся «готовых», и кнопка пропадает, а окно с итогом должно остаться.
  const [shown, setShown] = useState<{ cards: number; fields: number } | null>(null);
  const count = useSafeCount(batch, items, schema).data;
  const close = () => {
    setShown(null);
    onChanged?.();
  };
  const dialog = shown && schema && (
    <AcceptSafeDialog open onClose={close} batchId={batch.id} manual={batch.path === "MANUAL"} cards={shown.cards} fields={shown.fields} run={run} />
  );
  const canAccept = !!count && count.fields > 0 && !!schema;

  async function run(): Promise<AiSafeApplied[]> {
    const out: AiSafeApplied[] = [];
    for (const row of eligibleRows(batch)) {
      const one = await applyRow(row, schema as CardSchema);
      if (one) out.push(one);
    }
    invalidateCards(qc);
    invalidateAfterBatch.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    onChanged?.();
    return out;
  }

  return (
    <>
      {canAccept && (
        <Button size="sm" variant="surface" onClick={() => count && setShown(count)} data-testid="batch-accept-safe">
          Принять безопасное
        </Button>
      )}
      {dialog}
    </>
  );
}
