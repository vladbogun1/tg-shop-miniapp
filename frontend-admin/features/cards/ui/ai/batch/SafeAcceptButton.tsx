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

/** Задачи пакета, к которым применимо «безопасное»: готовы, не решены и искали в интернете. */
const eligibleRows = (b: AiBatch): AiBatchRow[] => b.jobs.filter((r) => r.status === "DONE" && !r.outcome && r.searched);

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

export function SafeAcceptButton({ batch, items, schema }: { batch: AiBatch; items: CardItem[] | undefined; schema: CardSchema | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const count = useSafeCount(batch, items, schema).data;
  if (!count || count.fields === 0 || !schema) return null;

  async function run(): Promise<AiSafeApplied[]> {
    const out: AiSafeApplied[] = [];
    for (const row of eligibleRows(batch)) {
      const one = await applyRow(row, schema as CardSchema);
      if (one) out.push(one);
    }
    invalidateCards(qc);
    invalidateAfterBatch.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    return out;
  }

  return (
    <>
      <Button size="sm" variant="surface" onClick={() => setOpen(true)} data-testid="batch-accept-safe">
        Принять безопасное
      </Button>
      {open && <AcceptSafeDialog open onClose={() => setOpen(false)} batchId={batch.id} cards={count.cards} fields={count.fields} run={run} />}
    </>
  );
}
