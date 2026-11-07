"use client";

/**
 * Ручной путь через ChatGPT, шаг «проверка»: вставленный ответ разобран — дальше тот же экран, что у встроенного ИИ
 * (`CardReviewPanel` внутри окна): правка значений, фото, статус, применение. После записи ответ помечается MANUAL.
 */
import type { AiMenuItem } from "@/features/ai";
import { useMemo } from "react";
import type { FieldContext } from "../../model/ai-card";
import { useCardItems } from "../../queries";
import { CardReviewPanel } from "../ai/CardReviewPanel";
import { neighborsOf } from "../ai/use-card-ai-review";
import type { CardCompletion } from "./use-card-completion";

export function ManualReview({ c, onBackToAi }: { c: CardCompletion; onBackToAi?: () => void }) {
  const all = useCardItems();
  const item = c.item;
  const ctx = useMemo<FieldContext | null>(
    () => (item ? { changes: null, versionChanged: false, neighbors: neighborsOf(all.data, item) } : null),
    [all.data, item],
  );
  if (!c.review || !item || !ctx) return null;
  const menu = (): AiMenuItem[] => [
    { label: "Вставить другой ответ", onSelect: c.clearAnswer },
    ...(onBackToAi && !c.saved ? [{ label: "Вернуться к встроенному ИИ ✦", onSelect: onBackToAi }] : []),
  ];
  return (
    <CardReviewPanel
      embedded
      item={item}
      review={c.review}
      ctx={ctx}
      created={c.reason === "created" || item.unfinished === true}
      title="Проверка ответа"
      model={c.model}
      onBack={c.backToAnswer}
      menu={menu}
      onApplied={c.onApplied}
      onSaved={c.onSaved}
      onClose={c.onClose}
    />
  );
}
