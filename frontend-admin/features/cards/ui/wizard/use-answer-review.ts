"use client";

/** Шаги 2–3 мастера: ответ ИИ → проверка по карточкам → выбор полей → запись (`PUT /cards/import`). */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@shop/core/errors";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { buildCardReview, bulkSelection, levelCounts, missingFromAnswer, parseCardAnswer, type BulkKind, type Proposal, type ProductReview } from "../../model";
import type { CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import { autoReady, buildImportItem, mergeSel, type ProductSel } from "../../model/selection";
import type { CardImportItem } from "../../model/wire";
import { cardsApi, type CardImportResult } from "../../api";
import { invalidateCards } from "../../queries";

export type ReviewFilter = "all" | "ok" | "warn" | "error";

export interface ImportSummary {
  result?: CardImportResult;
  error?: string;
  titles: Map<string, string>;
}

interface Args {
  items: CardItem[];
  schema: CardSchema;
  ids: Map<string, string>;
  /** Answer ids of every prompt batch (to see what the answer left out). */
  batchPids: string[][];
}

interface SendVars {
  payload: CardImportItem[];
  replaceSpecs: boolean;
  titles: Map<string, string>;
}

export function useAnswerReview({ items, schema, ids, batchPids }: Args) {
  const qc = useQueryClient();

  // ---- 2. answer -----------------------------------------------------------------
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ id: string; problems: string[] }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [sel, setSel] = useState<Map<string, ProductSel>>(new Map());
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function check(text = answer, keepSelection = false) {
    const parsed = parseCardAnswer(text);
    setParseErrors(parsed.errors);
    setNotes(parsed.notes);
    if (!text.trim() || parsed.entries.size === 0) {
      setReviews(null);
      setUnknown([]);
      setInvalid([]);
      setMissing([]);
      return;
    }
    const r = buildCardReview(parsed, { schema, items, ids });
    setUnknown(r.unknown);
    setInvalid(r.invalid);
    setMissing(missingFromAnswer(batchPids, new Set(r.products.map((p) => p.id))));
    setReviews(r.products);
    // After a schema change keep what the admin chose, but let newly valid fields in.
    setSel((prev) => new Map(r.products.map((p) => [p.id, mergeSel(keepSelection ? prev.get(p.id) : undefined, p)])));
    setSummary(null);
  }

  // A new option was added to the schema → re-check the same answer against it.
  const schemaRef = useRef(schema);
  const recheck = useRef(check);
  recheck.current = check;
  useEffect(() => {
    if (schemaRef.current === schema) return;
    schemaRef.current = schema;
    if (reviews && answer.trim()) recheck.current(answer, true);
  }, [schema, reviews, answer]);

  function clearAnswer() {
    setAnswer("");
    setReviews(null);
    setParseErrors([]);
    setNotes([]);
    setUnknown([]);
    setInvalid([]);
    setMissing([]);
    setSummary(null);
  }

  // ---- 3. review -----------------------------------------------------------------
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [replaceSpecs, setReplaceSpecs] = useState(false);
  // Sure cards (overall ≥ 80, no guessed field) → «Готово»; the rest → «Проверить».
  const [autoMark, setAutoMark] = useState(true);
  const [addOption, setAddOption] = useState<Proposal | null>(null);

  const counts = useMemo(() => levelCounts(reviews ?? []), [reviews]);
  const visibleReviews = useMemo(() => (reviews ?? []).filter((r) => reviewFilter === "all" || r.level === reviewFilter), [reviews, reviewFilter]);

  const payload = (reviews ?? [])
    .map((r) => buildImportItem(r, sel.get(r.id), { markReady: autoMark && autoReady(r, sel.get(r.id)), model }))
    .filter((x): x is CardImportItem => !!x);
  const toReady = payload.filter((p) => p.markReady).length;

  function patchSel(id: string, patch: Partial<ProductSel>) {
    setSel((prev) => {
      const n = new Map(prev);
      const cur = n.get(id);
      if (cur) n.set(id, { ...cur, ...patch });
      return n;
    });
  }

  function bulk(kind: BulkKind) {
    setSel((prev) => new Map([...prev, ...(reviews ?? []).map((r): [string, ProductSel] => [r.id, bulkSelection(kind, r, prev.get(r.id))])]));
  }

  const importMutation = useApiMutation<CardImportResult, SendVars>({
    mutationFn: ({ payload: items, replaceSpecs: replace }) => cardsApi.import({ items, replaceSpecs: replace }),
    toastOnError: false,
    onError: (e, { titles }) => {
      setSummary({ error: errorMessage(e, undefined, "ошибка сети"), titles });
      toast.error("Не удалось сохранить — см. итог");
      invalidateCards(qc);
    },
    onSuccess: (result, vars) => {
      setSummary({ result, titles: vars.titles });
      const rejected = new Set(result.rejected.map((x) => x.productId));
      const sent = new Set(vars.payload.map((p) => p.productId).filter((id) => !rejected.has(id)));
      setReviews((prev) => (prev ?? []).filter((r) => !sent.has(r.item.id)));
      (result.rejected.length ? toast.error : toast.success)(`Сохранено карточек: ${result.applied}${result.rejected.length ? `, отклонено: ${result.rejected.length}` : ""}`);
      invalidateCards(qc);
    },
  });

  function send() {
    if (!reviews || !payload.length) return;
    importMutation.mutate({ payload, replaceSpecs, titles: new Map(reviews.map((r) => [r.item.id, r.item.title])) });
  }

  return {
    answer, setAnswer, model, setModel, parseErrors, notes, unknown, invalid, missing, reviews, setReviews, sel, summary,
    check, clearAnswer,
    reviewFilter, setReviewFilter, replaceSpecs, setReplaceSpecs, autoMark, setAutoMark, addOption, setAddOption,
    counts, visibleReviews, payload, toReady, patchSel, bulk, send, sending: importMutation.isPending,
    invalidateWithSchema: () => invalidateCards(qc, true),
  };
}

export type AnswerReview = ReturnType<typeof useAnswerReview>;
