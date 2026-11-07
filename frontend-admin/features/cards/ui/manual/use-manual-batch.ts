"use client";

/**
 * Состояние ручного пакета по частям. Пакет — строка `ai_batches` на сервере: товары с отпечатками на старте,
 * черновик экрана (часть, вставленное, размер части, модель) и задачи с ответами. Черновик пишется на сервер через
 * мгновение после правки и сразу — при закрытии; ответ части уходит задачами при уходе с части, «К проверке» и
 * закрытии. Проверка — те же задачи, что у пакета ИИ: «Принять», «Принять безопасное», «Править». Экран — `ManualBatchLayer`.
 */
import { invalidateAfterBatch } from "@/features/ai";
import { errorMessage } from "@shop/core/errors";
import { STALE_TIME } from "@shop/core/query";
import { toast } from "@shop/ui/toast";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { manualApi, type ManualBatch } from "../../api-manual";
import { cardsKeys } from "../../keys";
import { CARD_PROMPT_VERSION } from "../../model/ai-card";
import { assignCardIds, type CardItem } from "../../model/item";
import { checkPart, partAnswers, partsOf, pendingCount, readDraft, resize, unansweredOf, type ManualDraft, type ManualPartSize, type PartCheck } from "../../model/manual-batch";
import { buildCardPrompt } from "../../model/prompt";
import type { CardSchema } from "../../model/schema";
import { useCardItems, useCardSchema } from "../../queries";

const SAVE_DELAY_MS = 700;
const NO_SAVE = "Не удалось сохранить черновик на сервере — вставленное может пропасть";

/** Незаконченный ручной пакет этого админа (на любом устройстве); null — его нет. */
export function useManualCurrent() {
  return useQuery({ queryKey: cardsKeys.manual(), queryFn: manualApi.current, staleTime: STALE_TIME.quick, retry: false });
}

export function setManualCurrent(qc: QueryClient, b: ManualBatch | null): void {
  qc.setQueryData(cardsKeys.manual(), b);
  invalidateAfterBatch.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
}

/** Черновик экрана: читается с сервера при открытии, каждая правка сохраняется туда же с короткой задержкой. */
function useServerDraft(open: boolean, batch: ManualBatch | null) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const latest = useRef<ManualDraft | null>(null);
  const loadedFor = useRef<number | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned = useRef(false);
  const id = batch?.batch.id ?? null;

  useEffect(() => {
    if (!open) loadedFor.current = null;
    if (!open || !batch || loadedFor.current === batch.batch.id) return;
    loadedFor.current = batch.batch.id;
    const d = readDraft(batch.draft, batch.items.length, batch.partSize);
    latest.current = d;
    setDraft(d);
  }, [open, batch]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || id === null || !latest.current) return;
    dirty.current = false;
    try {
      qc.setQueryData(cardsKeys.manual(), await manualApi.saveDraft(id, JSON.stringify(latest.current)));
    } catch {
      dirty.current = true;
      if (!warned.current) toast.info(NO_SAVE);
      warned.current = true;
    }
  }, [id, qc]);

  const update = useCallback(
    (fn: (d: ManualDraft) => ManualDraft) => {
      if (!latest.current) return;
      latest.current = fn(latest.current);
      setDraft(latest.current);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => () => void flush(), [flush]);
  return { draft, latest, update, flush };
}

/** Части, разбор ответа каждой и промпт текущей — по свежим карточкам из каталога. */
function useParts(batch: ManualBatch | null, draft: ManualDraft | null, schema: CardSchema | undefined, all: CardItem[] | undefined) {
  const order = useMemo(() => (batch?.items ?? []).map((i) => i.subjectId), [batch?.items]);
  const versions = useMemo(() => new Map((batch?.items ?? []).map((i) => [i.subjectId, i.subjectVersion])), [batch?.items]);
  const byId = useMemo(() => new Map((all ?? []).map((i) => [i.id, i])), [all]);
  const ids = useMemo(() => assignCardIds(order), [order]);
  const size = draft?.size ?? 4;
  const parts = useMemo(() => partsOf(order, size), [order, size]);
  const partItems = useCallback((i: number): CardItem[] => (parts[i] ?? []).flatMap((id) => byId.get(id) ?? []), [parts, byId]);
  const promptOf = useCallback(
    (i: number) => (schema && parts.length ? buildCardPrompt(partItems(i), schema, { part: i + 1, total: parts.length, ids }) : ""),
    [schema, parts.length, partItems, ids],
  );
  const checkOf = useCallback(
    (i: number, d: ManualDraft): PartCheck | null => (schema ? checkPart(d.answers[i] ?? "", partItems(i), parts[i]?.length ?? 0, schema, ids, d.model) : null),
    [schema, partItems, parts, ids],
  );
  return { order, versions, parts, partItems, promptOf, checkOf };
}

export function useManualBatch(open: boolean) {
  const qc = useQueryClient();
  const all = useCardItems();
  const schema = useCardSchema().data;
  const current = useManualCurrent();
  const batch = current.data ?? null;
  const { draft, latest, update, flush } = useServerDraft(open, batch);
  const p = useParts(batch, draft, schema, all.data);
  const [busy, setBusy] = useState(false);
  const id = batch?.batch.id ?? null;

  const checks = useMemo(() => (draft ? p.parts.map((_, i) => p.checkOf(i, draft)) : []), [draft, p]);
  const part = draft?.part ?? 0;
  const prompt = useMemo(() => p.promptOf(part), [p, part]);
  const jobs = batch?.batch.jobs ?? [];

  /** Ответы частей, которые поменялись после отправки, уходят задачами: по товару на задачу. */
  const sendChanged = useCallback(async () => {
    const d = latest.current;
    if (!d || id === null) return;
    for (let i = 0; i < d.answers.length; i++) {
      const text = d.answers[i] ?? "";
      const check = p.checkOf(i, d);
      if (text === d.sent[i] || !check) continue;
      const answers = partAnswers(check, p.versions, p.partItems(i));
      qc.setQueryData(cardsKeys.manual(), await manualApi.answers(id, { prompt: p.promptOf(i), promptVersion: CARD_PROMPT_VERSION, part: p.parts[i] ?? [], answers }));
      update((x) => ({ ...x, sent: x.sent.map((s, k) => (k === i ? text : s)) }));
    }
  }, [latest, id, p, qc, update]);

  const run = useCallback(
    async (fn: () => Promise<void>, fallback: string): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        return true;
      } catch (e) {
        toast.error(errorMessage(e, undefined, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const go = (patch: Partial<ManualDraft>) =>
    run(async () => {
      await sendChanged();
      update((d) => ({ ...d, ...patch }));
      await flush();
    }, "Не удалось отправить ответ части");

  return {
    batch,
    draft,
    busy,
    loading: current.isLoading || all.isLoading || !schema,
    schema,
    items: all.data,
    parts: p.parts,
    partItems: p.partItems,
    checks,
    current: checks[part] ?? null,
    prompt,
    /** Готовые ответы, ещё не принятые и не отклонённые. */
    rows: jobs.filter((r) => r.status === "DONE" && !r.outcome),
    /** Сколько будет в проверке после отправки изменённых частей. */
    pending: draft ? pendingCount(p.parts, draft, checks, jobs) : 0,
    unanswered: unansweredOf(p.order, jobs),
    decided: jobs.filter((r) => r.outcome).length,
    setAnswer: (text: string) => update((d) => ({ ...d, answers: d.answers.map((a, i) => (i === d.part ? text : a)) })),
    setModel: (model: string) => update((d) => ({ ...d, model })),
    setSize: (size: ManualPartSize) => update((d) => resize(d, batch?.items.length ?? 0, size)),
    goPart: (n: number) => go({ part: Math.max(0, Math.min((draft?.answers.length ?? 1) - 1, n)), stage: "parts" }),
    toReview: () => go({ stage: "review" }),
    /** Закрыть: отправить несохранённое; сбой не держит слой открытым — черновик и так на сервере. */
    save: () => run(async () => {
      await sendChanged();
      await flush();
    }, "Не удалось отправить ответ части"),
    finish: () => run(async () => {
      if (id !== null) await manualApi.finish(id);
      setManualCurrent(qc, null);
    }, "Не удалось закончить пакет"),
    discard: () => run(async () => {
      if (id !== null) await manualApi.discard(id);
      setManualCurrent(qc, null);
    }, "Не удалось удалить пакет"),
  };
}

export type ManualBatchState = ReturnType<typeof useManualBatch>;
