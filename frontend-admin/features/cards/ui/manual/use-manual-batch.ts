"use client";

/**
 * Состояние ручного пакета по частям: черновик из `core/storage` (каждая правка сразу записывается), разбор ответа
 * каждой части по свежим карточкам, промпт текущей части, приём карточки (тем же импортом, что лента пакета ИИ,
 * с отметкой MANUAL в метриках). Сам экран — `ManualBatchLayer`.
 */
import { useMarkManual } from "@/features/ai";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialKeys, reviewRows, type FieldContext } from "../../model/ai-card";
import { assignCardIds, type CardItem } from "../../model/item";
import {
  changedSince,
  checkPart,
  clearDraft,
  loadDraft,
  partsOf,
  pendingReviews,
  saveDraft,
  unanswered,
  type ManualDraft,
  type ManualStage,
  type PartCheck,
} from "../../model/manual-batch";
import { buildCardPrompt } from "../../model/prompt";
import type { ProductReview } from "../../model/types";
import { invalidateCards, useCardItems, useCardSchema } from "../../queries";
import { writeCard } from "../ai/batch/card-batch-apply";
import { neighborsOf } from "../ai/use-card-ai-review";

const NO_SAVE = "Браузер не даёт сохранить черновик — после перезагрузки вставленное пропадёт";

function usePersistedDraft(open: boolean) {
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const latest = useRef<ManualDraft | null>(null);
  const warned = useRef(false);
  useEffect(() => {
    if (!open) return;
    const d = loadDraft();
    latest.current = d;
    setDraft(d);
  }, [open]);
  const update = useCallback((fn: (d: ManualDraft) => ManualDraft) => {
    if (!latest.current) return;
    const next = fn(latest.current);
    latest.current = next;
    setDraft(next);
    if (!saveDraft(next) && !warned.current) {
      warned.current = true;
      toast.info(NO_SAVE);
    }
  }, []);
  return { draft, update };
}

export function useManualBatch(open: boolean) {
  const qc = useQueryClient();
  const all = useCardItems();
  const schema = useCardSchema().data;
  const markManual = useMarkManual();
  const { draft, update } = usePersistedDraft(open);

  const draftIds = draft?.ids;
  const answers = draft?.answers;
  const byId = useMemo(() => new Map((all.data ?? []).map((i) => [i.id, i])), [all.data]);
  const ids = useMemo(() => assignCardIds(draftIds ?? []), [draftIds]);
  const parts = useMemo(() => partsOf(draftIds ?? []), [draftIds]);
  const partItems = useCallback((i: number): CardItem[] => (parts[i] ?? []).flatMap((id) => byId.get(id) ?? []), [parts, byId]);
  const checks = useMemo<PartCheck[]>(
    () => (schema && answers ? parts.map((p, i) => checkPart(answers[i] ?? "", partItems(i), p.length, schema, ids)) : []),
    [schema, answers, parts, partItems, ids],
  );
  const part = draft?.part ?? 0;
  const prompt = useMemo(
    () => (schema && parts.length ? buildCardPrompt(partItems(part), schema, { part: part + 1, total: parts.length, ids }) : ""),
    [schema, parts.length, partItems, part, ids],
  );
  const pending = useMemo(() => pendingReviews(checks, draft?.done ?? []), [checks, draft?.done]);

  const ctxOf = useCallback(
    (item: CardItem): FieldContext => ({ changes: null, versionChanged: draft ? changedSince(draft, item) : false, neighbors: neighborsOf(all.data, item) }),
    [draft, all.data],
  );

  /** Карточка записана (из ленты или из «Править»): в метрики — ручной путь, из пакета — долой. */
  const finishCard = useCallback(
    (productId: string) => {
      markManual.mutate({ feature: "CARD", subjectIds: [productId] });
      update((d) => ({ ...d, done: d.done.includes(productId) ? d.done : [...d.done, productId] }));
    },
    [markManual, update],
  );

  /** «Принять» в ленте: выбор по умолчанию, как кнопка «Применить» на экране проверки. */
  const accept = useCallback(
    async (review: ProductReview) => {
      const rows = reviewRows(review, ctxOf(review.item));
      await writeCard(review, review.item.id, initialKeys(review, rows, review.item.unfinished === true), { translations: true, markReady: true });
      finishCard(review.item.id);
      invalidateCards(qc);
    },
    [ctxOf, finishCard, qc],
  );

  return {
    draft,
    loading: all.isLoading || !schema,
    parts,
    partItems,
    checks,
    current: checks[part] ?? null,
    prompt,
    pending,
    unanswered: draft ? unanswered(draft, checks) : [],
    byId,
    ctxOf,
    accept,
    finishCard,
    setAnswer: (text: string) => update((d) => ({ ...d, answers: d.answers.map((a, i) => (i === d.part ? text : a)) })),
    goPart: (n: number) => update((d) => ({ ...d, part: Math.max(0, Math.min(d.answers.length - 1, n)), stage: "parts" as ManualStage })),
    toReview: () => update((d) => ({ ...d, stage: "review" })),
    finish: () => clearDraft(),
  };
}

export type ManualBatch = ReturnType<typeof useManualBatch>;
