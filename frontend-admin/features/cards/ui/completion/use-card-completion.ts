"use client";

/**
 * Ручной путь окна «Оформить с ИИ» для одного товара (экран — `CardCompletionModal`): промпт, вставленный ответ и
 * его разбор. Проверка и применение — общий со встроенным ИИ `CardReviewPanel`; здесь только то, что после записи
 * ответ помечается как принесённый из ChatGPT (path=MANUAL) и окно знает, сохранено ли и выложено.
 */
import { toMinor } from "@shop/core/money";
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@shop/ui/toast";
import { useMarkManual } from "@/features/ai";
import { cardsApi } from "../../api";
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
  }, [open, productId]);

  function check(text = answer) {
    if (!item || !schema) return;
    const out = reviewAnswer(text, { schema, items: [item], ids }, productId);
    setErrors(out.errors);
    setNotes(out.notes);
    setReview(out.product);
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

  const markManual = useMarkManual();
  /** Ответ принесли из ChatGPT: без отметки доля встроенного ИИ в метриках всегда 100 %. */
  const onApplied = () => markManual.mutate({ feature: "CARD", subjectIds: [productId] });
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
    check, close, clearAnswer, backToAnswer, onApplied, onSaved, onClose,
  };
}

export type CardCompletion = ReturnType<typeof useCardCompletion>;
