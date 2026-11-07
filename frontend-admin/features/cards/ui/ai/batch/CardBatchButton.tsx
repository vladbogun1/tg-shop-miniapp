"use client";

import { BatchConfirm, invalidateAfterBatch, newIdemKey, useAiSummary } from "@/features/ai";
import { useFinanceAccess } from "@/features/procurement";
import { errorMessage } from "@shop/core/errors";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { cardsApi } from "../../../api";
import { invalidateCards, useCardSchema } from "../../../queries";
import { ManualStartButton } from "../../manual/ManualBatchEntry";
import { startCardBatch } from "./card-batch-apply";

/**
 * Кнопки панели выбора: «Через ChatGPT вручную (N)» — всегда, без ИИ, ключа и лимитов; «Заполнить с ИИ (N)» — пока
 * встроенный ИИ включён и настроен.
 */
export function CardBatchButton({ productIds, onStarted }: { productIds: string[]; onStarted?: () => void }) {
  if (productIds.length === 0) return null;
  return (
    <>
      <AiBatchButton productIds={productIds} onStarted={onStarted} />
      <ManualStartButton productIds={productIds} />
    </>
  );
}

/** «Заполнить с ИИ (N)»: подтверждение (минуты, у финансиста ещё и деньги) → пакет. Свежую выгрузку берём при запуске: отпечаток карточки считается по ней. */
function AiBatchButton({ productIds, onStarted }: { productIds: string[]; onStarted?: () => void }) {
  const qc = useQueryClient();
  const summary = useAiSummary().data;
  const finance = useFinanceAccess();
  const schema = useCardSchema().data;
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdemKey());
  if (!summary?.enabled || !summary.configured) return null;

  async function start() {
    if (!schema) return;
    setStarting(true);
    setError(null);
    try {
      const items = await cardsApi.export("all", productIds);
      await startCardBatch(items, schema, key.current);
      invalidateCards(qc);
      invalidateAfterBatch.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
      setOpen(false);
      key.current = newIdemKey();
      onStarted?.();
    } catch (e) {
      setError(errorMessage(e, undefined, "Не удалось запустить пакет"));
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="surface" icon={<Sparkles className="h-4 w-4" />} onClick={() => setOpen(true)} data-testid="batch-open">
        Заполнить с ИИ ({productIds.length})
      </Button>
      <BatchConfirm open={open} onClose={() => setOpen(false)} feature="COMPLETION" count={productIds.length} finance={finance} starting={starting} onStart={() => void start()} error={error} />
    </>
  );
}
