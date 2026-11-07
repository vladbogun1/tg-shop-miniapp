"use client";

/**
 * Применение результата ИИ по карточке тем же путём сохранения, что у ручного мастера (`useCompletionSave`:
 * импорт карточки, метка ИИ в card_meta, «выложить»), и отчёт серверу о счётчиках после успеха.
 */
import { outcomeCounts, useJobOutcome, type AiJob, type ReviewField } from "@/features/ai";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toProductSel } from "../../model/ai-card";
import type { PublishProblem } from "../../model/completion";
import type { CardItem } from "../../model/item";
import { autoReady, buildImportItem } from "../../model/selection";
import type { ProductReview } from "../../model/types";
import { priceToMinor } from "../completion/use-card-completion";
import { useCompletionSave } from "../completion/use-completion-save";

interface Args {
  job: AiJob;
  item: CardItem;
  review: ProductReview | null;
  rows: ReviewField[];
  selected: ReadonlySet<string>;
  translations: boolean;
  publish: boolean;
}

export function useCardAiApply(a: Args) {
  const router = useRouter();
  const outcome = useJobOutcome();
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [price, setPrice] = useState("");
  const [applied, setApplied] = useState(false);
  const counts = useRef({ applied: 0, rejected: 0, edited: 0, ignoredLocked: 0 });
  const wantsPublish = a.item.active !== true && a.publish;

  const report = (o: typeof counts.current) => outcome.mutate({ id: a.job.id, outcome: o });
  const save = useCompletionSave({
    onClose: () => router.back(),
    onProblem: setProblem,
    onSaved: () => {
      setApplied(true);
      report(counts.current);
    },
    onPublished: () => undefined,
  });

  function apply() {
    if (!a.review || save.saving) return;
    const sel = toProductSel(a.review, a.selected, { translations: a.translations });
    const payload = buildImportItem(a.review, sel, { markReady: autoReady(a.review, sel), publish: wantsPublish });
    if (!payload) return;
    counts.current = outcomeCounts(a.rows, a.selected);
    setProblem(null);
    save.save.mutate({ payload, publish: wantsPublish, item: a.item });
  }

  function reject() {
    report(outcomeCounts(a.rows, new Set()));
    router.push("/cards");
  }

  const minor = priceToMinor(price);
  return {
    apply,
    reject,
    saving: save.saving,
    problem,
    price,
    setPrice,
    priceMinor: minor,
    savePrice: () => minor !== null && save.savePrice.mutate({ item: a.item, priceMinor: minor }),
    applied,
  };
}
