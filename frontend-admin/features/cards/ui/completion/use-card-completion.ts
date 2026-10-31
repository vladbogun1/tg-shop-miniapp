"use client";

/** Состояние и действия окна «Оформить с ИИ» для одного товара (экран — `CardCompletionModal`). */
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@shop/ui/toast";
import { cardsApi } from "../../api";
import { cardsKeys } from "../../keys";
import { useCardSchema } from "../../queries";
import { HIDDEN_TOAST, reviewAnswer, type PublishProblem, type ProductReview, type Proposal } from "../../model";
import { assignCardIds } from "../../model/item";
import { buildCardPrompt } from "../../model/prompt";
import { autoReady, buildImportItem, defaultSel, mergeSel, type ProductSel } from "../../model/selection";
import { useCompletionSave, type CardCompletionResult } from "./use-completion-save";

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
  return Number.isFinite(uah) && uah > 0 ? Math.round(uah * 100) : null;
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
  const [sel, setSel] = useState<ProductSel | null>(null);
  const [publish, setPublish] = useState(true);
  // null = automatic: READY when the AI is sure (see autoReady), else «Проверить».
  const [markReadyOverride, setMarkReadyOverride] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [price, setPrice] = useState("");
  const [addOption, setAddOption] = useState<Proposal | null>(null);

  // Fresh state for every product the modal is opened for.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setPreview(false);
    setAnswer("");
    setErrors([]);
    setNotes([]);
    setReview(null);
    setSel(null);
    setPublish(true);
    setMarkReadyOverride(null);
    setSaved(false);
    setPublished(false);
    setProblem(null);
    setPrice("");
  }, [open, productId]);

  function check(text = answer, keep = false) {
    if (!item || !schema) return;
    const out = reviewAnswer(text, { schema, items: [item], ids }, productId);
    setErrors(out.errors);
    setNotes(out.notes);
    setReview(out.product);
    if (out.empty) return;
    const created = reason === "created";
    const p = out.product;
    setSel((prev) => (!p ? null : keep ? mergeSel(prev ?? undefined, p, { created }) : defaultSel(p, { created })));
    setProblem(null);
  }

  // A fresh schema (an option was added) re-checks the pasted answer, keeping the selection.
  const schemaRef = useRef(schema);
  const recheck = useRef(check);
  recheck.current = check;
  useEffect(() => {
    if (schemaRef.current === schema) return;
    schemaRef.current = schema;
    if (review && answer.trim()) recheck.current(answer, true);
  }, [schema, review, answer]);

  const sure = !!review && !!sel && autoReady(review, sel);
  const markReady = markReadyOverride ?? sure;
  const payload = review && sel ? buildImportItem(review, sel, { markReady, model, publish }) : null;

  const { save, savePrice, saving } = useCompletionSave({
    onClose,
    onProblem: setProblem,
    onSaved: (isPublished) => {
      setSaved(true);
      setReview(null);
      setAnswer("");
      setPublished(isPublished);
    },
    onPublished: () => setPublished(true),
  });

  function close() {
    if ((!saved || !published) && (reason === "created" || item?.unfinished === true)) toast.info(HIDDEN_TOAST);
    onClose({ saved, published });
  }

  function doSave() {
    if (!payload || !item || saving) return;
    setProblem(null);
    save.mutate({ payload, publish, item });
  }

  function doSavePrice() {
    const priceMinor = priceToMinor(price);
    if (!item || priceMinor === null || saving) return;
    savePrice.mutate({ item, priceMinor });
  }

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
    review, setReview, sel, setSel,
    publish, setPublish, markReady, setMarkReadyOverride, markReadyOverride, sure,
    saved, published, problem, price, setPrice, addOption, setAddOption,
    payload, saving, check, close, clearAnswer, save: doSave, savePrice: doSavePrice,
  };
}

export type CardCompletion = ReturnType<typeof useCardCompletion>;
