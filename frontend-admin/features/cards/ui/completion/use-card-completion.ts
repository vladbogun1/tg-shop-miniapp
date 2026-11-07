"use client";

/**
 * Ручной путь окна «Оформить с ИИ» для одного товара (экран — `CardCompletionModal`): промпт, вставленный ответ и
 * его разбор. Разобранный ответ — задача «ИИ-задач» (путь MANUAL, без модели и денег, работает и при выключенном ИИ):
 * её видно в «Проверить», а применение отчитывается ей исходом, как у встроенного ИИ. Проверка и применение — общий
 * со встроенным ИИ `CardReviewPanel`; окно знает, сохранено ли и выложено.
 */
import { toMinor } from "@shop/core/money";
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@shop/ui/toast";
import { useJobOutcome, type OutcomeCounts } from "@/features/ai";
import { cardsApi } from "../../api";
import { manualApi } from "../../api-manual";
import { CARD_PROMPT_VERSION, cardVersion } from "../../model/ai-card";
import { cardsKeys } from "../../keys";
import { useCardSchema } from "../../queries";
import { HIDDEN_TOAST, reviewAnswer, type ProductReview } from "../../model";
import { assignCardIds } from "../../model/item";
import { buildCardPrompt } from "../../model/prompt";
import type { CardCompletionResult } from "./use-completion-save";

export type CompletionReason = "created" | "manual";

interface Args {
  productId: string;
  open: boolean;
  reason: CompletionReason;
  onClose: (result?: CardCompletionResult) => void;
}

/** Цена из поля ввода в гривнах → копейки; null — не число или не больше нуля. */
export function priceToMinor(text: string): number | null {
  const uah = Number(text.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(uah) && uah > 0 ? toMinor(uah) : null;
}

function useCompletionData(productId: string, open: boolean) {
  const schemaQ = useCardSchema();
  const itemQ = useQuery({
    queryKey: cardsKeys.exportOne(productId),
    queryFn: async () => (await cardsApi.export("all", [productId])).find((i) => i.id === productId) ?? null,
    enabled: open && !!productId,
    staleTime: QUERY_PRESETS.live.staleTime,
  });
  const item = itemQ.data ?? null;
  const schema = schemaQ.data;
  const ids = useMemo(() => assignCardIds([productId]), [productId]);
  const prompt = useMemo(() => (item && schema ? buildCardPrompt([item], schema, { part: 1, total: 1, ids }) : ""), [item, schema, ids]);
  return { item, schema, ids, prompt, loading: itemQ.isLoading || schemaQ.isLoading };
}

export function useCardCompletion({ productId, open, reason, onClose }: Args) {
  const { item, schema, ids, prompt, loading } = useCompletionData(productId, open);

  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [review, setReview] = useState<ProductReview | null>(null);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  /** Задача последнего разобранного ответа (запись на сервер идёт в фоне; null — не записалась). */
  const task = useRef<Promise<number | null>>(Promise.resolve(null));

  // Fresh state for every product the modal is opened for.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setPreview(false);
    setAnswer("");
    setErrors([]);
    setNotes([]);
    setReview(null);
    setSaved(false);
    setPublished(false);
    task.current = Promise.resolve(null);
  }, [open, productId]);

  /** Разобранный ответ → задача «готово, ждёт проверки»; повторная вставка заменяет нерешённую. */
  function register(text: string) {
    if (!item) return;
    const body = { productId, created: reason === "created", subjectVersion: cardVersion(item), prompt, promptVersion: CARD_PROMPT_VERSION, answer: text };
    task.current = manualApi.single(body).then(
      (job) => job.id,
      () => {
        toast.info("Ответ не записался в «ИИ-задачи» — применить карточку это не мешает");
        return null;
      },
    );
  }

  function check(text = answer) {
    if (!item || !schema) return;
    const out = reviewAnswer(text, { schema, items: [item], ids }, productId);
    setErrors(out.errors);
    setNotes(out.notes);
    setReview(out.product);
    if (out.product) register(text);
  }

  // A fresh schema (an option was added) re-checks the pasted answer: the review starts over on the new schema.
  const schemaRef = useRef(schema);
  const recheck = useRef(check);
  recheck.current = check;
  useEffect(() => {
    if (schemaRef.current === schema) return;
    schemaRef.current = schema;
    if (review && answer.trim()) recheck.current(answer);
  }, [schema, review, answer]);

  const outcome = useJobOutcome();
  /** Применили: задаче ответа — исход (в метриках это ручной путь, MANUAL). */
  const onApplied = (counts: OutcomeCounts) =>
    void task.current.then((id) => {
      if (id !== null) outcome.mutate({ id, outcome: counts });
    });
  const onSaved = (isPublished: boolean) => {
    setSaved(true);
    setPublished(isPublished);
  };

  function close() {
    if ((!saved || !published) && (reason === "created" || item?.unfinished === true)) toast.info(HIDDEN_TOAST);
    onClose({ saved, published });
  }

  /** «Назад» из проверки: ответ остаётся в поле — его можно поправить и проверить снова. */
  const backToAnswer = () => setReview(null);
  /** Задача ответа для журнала применений (пока ответ пишется на сервер — ждём его). */
  const jobId = () => task.current;

  function clearAnswer() {
    setAnswer("");
    setReview(null);
    setErrors([]);
    setNotes([]);
  }

  return {
    item, schema, prompt, loading, reason,
    copied, setCopied, preview, setPreview,
    answer, setAnswer, model, setModel, errors, notes,
    review, saved, published,
    check, close, clearAnswer, backToAnswer, onApplied, onSaved, onClose, jobId,
  };
}

export type CardCompletion = ReturnType<typeof useCardCompletion>;
