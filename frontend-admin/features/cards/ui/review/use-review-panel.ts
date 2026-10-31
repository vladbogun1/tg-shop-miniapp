"use client";

/** Состояние панели проверки одной карточки: данные, правки (характеристики и тексты), «Принять», «Сохранить правки», «Вернуть на проверку», горячие клавиши. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductSpecs } from "@/lib/api";
import { isTopLayer } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { useApiMutation } from "@shop/ui/mutation";
import { cardsApi } from "../../api";
import { cardsKeys } from "../../keys";
import { invalidateCards } from "../../queries";
import type { CardItem } from "../../model/item";
import { buildAcceptBody, currentTextOf, realTextEdits, type Lang } from "../../model/review-edit";
import { sameValue, type TextField } from "../../model";
import { fieldsWord, metaOf, tabOf } from "../../model/view";

interface Args {
  layer: string;
  item: CardItem;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onDone: () => void;
  onDirty: (d: boolean) => void;
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** J/K (и русские О/Л) — следующая/предыдущая, A (Ф) — принять. */
export function panelKeyAction(key: string): "next" | "prev" | "accept" | null {
  const k = key.toLowerCase();
  if (k === "j" || k === "о") return "next";
  if (k === "k" || k === "л") return "prev";
  if (k === "a" || k === "ф") return "accept";
  return null;
}

export function useReviewPanel({ layer, item, onPrev, onNext, onDone, onDirty }: Args) {
  const qc = useQueryClient();
  const reviewQ = useQuery({ queryKey: cardsKeys.review(item.id), queryFn: () => cardsApi.review(item.id), staleTime: 0 });
  const data = reviewQ.data;
  const cur = data?.item ?? item;
  const tab = tabOf(cur);
  const meta = metaOf(cur);

  const [specsDraft, setSpecsDraft] = useState<ProductSpecs | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});

  const currentText = useCallback((lang: Lang, field: TextField) => currentTextOf(cur, data?.translations, lang, field), [cur, data]);
  const textEdits = useMemo(() => realTextEdits(texts, currentText), [texts, currentText]);
  const specsEdited = specsDraft !== null && !sameValue(specsDraft, cur.specs ?? {});
  const dirty = specsEdited || textEdits.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const body = () => ({ ...buildAcceptBody(specsEdited ? (specsDraft as Record<string, unknown>) : null, textEdits), ready: true });

  const accept = useApiMutation({
    mutationFn: () => cardsApi.accept(cur.id, body()),
    errorFallback: "Не удалось сохранить",
    invalidate: [cardsKeys.review(cur.id)],
    onSuccess: (res) => {
      const dropped = res.issues.length;
      (dropped ? toast.info : toast.success)(
        `«${cur.title}» — в «Готово»${dirty ? " с правками" : ""}${dropped ? ` · сервер отбросил ${dropped} ${fieldsWord(dropped)}` : ""}`
      );
      invalidateCards(qc);
      onDone();
    },
  });

  const saveEdits = useApiMutation({
    mutationFn: () => cardsApi.accept(cur.id, body()),
    errorFallback: "Не удалось сохранить",
    success: "Правки сохранены",
    onSuccess: async () => {
      setSpecsDraft(null);
      setTexts({});
      invalidateCards(qc);
      await reviewQ.refetch();
    },
  });

  const sendBack = useApiMutation({
    mutationFn: () => cardsApi.setCardStatus(cur.id, "AI_FILLED"),
    errorFallback: "Не удалось сохранить",
    success: `«${cur.title}» — снова в «Проверить»`,
    onSuccess: () => {
      invalidateCards(qc);
      onDone();
    },
  });

  const busy: "accept" | "back" | null = accept.isPending || saveEdits.isPending ? "accept" : sendBack.isPending ? "back" : null;
  const run = (m: { mutate: () => void }, allowed = true) => {
    if (!busy && allowed) m.mutate();
  };
  const doAccept = () => run(accept);

  // Esc is the overlay stack's.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target) || !isTopLayer(layer)) return;
      const action = panelKeyAction(e.key);
      if (action === "next" && onNext) onNext();
      else if (action === "prev" && onPrev) onPrev();
      else if (action === "accept" && tab !== "ready") doAccept();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return {
    reviewQ, data, cur, tab, meta, specsDraft, setSpecsDraft, texts,
    setText: (k: string, v: string) => setTexts((t) => ({ ...t, [k]: v })),
    currentText, dirty, busy,
    accept: doAccept, saveEdits: () => run(saveEdits, dirty), sendBack: () => run(sendBack),
  };
}

export type ReviewPanelState = ReturnType<typeof useReviewPanel>;
