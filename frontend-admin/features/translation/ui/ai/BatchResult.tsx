"use client";

/**
 * Итог пакета «Перевести с ИИ» на экране «Переводов»: «79 новых · 5 не заменены (ручные) · 0 ошибок» и
 * «Открыть в «Проверить ИИ»». Ход пакета, пока он идёт, показывает общая полоса сверху; когда пакет закончился,
 * списки переводов обновляются один раз. Нового экрана проверки нет: черновики лежат в обычной вкладке.
 */
import { isBatchOpen, newIdemKey, useAiBatchById, useRetryFailedBatch } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { batchResult, resultText } from "../../model/ai-batch";
import { invalidateTranslations } from "../../queries";

export function BatchResult({ batchId, onOpenReview, onDismiss }: { batchId: number; onOpenReview: () => void; onDismiss: () => void }) {
  const qc = useQueryClient();
  const batch = useAiBatchById(batchId).data;
  const retry = useRetryFailedBatch();
  const refreshed = useRef(false);
  const finished = !!batch && !isBatchOpen(batch);

  useEffect(() => {
    if (!finished || refreshed.current) return;
    refreshed.current = true;
    invalidateTranslations(qc);
  }, [finished, qc]);

  if (!batch || !finished) return null;
  const r = batchResult(batch);
  return (
    <div
      role="status"
      data-testid="tr-ai-summary"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px]"
    >
      <span className="min-w-0 flex-1 basis-56 font-semibold tabular-nums text-[var(--ink)]">
        {batch.status === "CANCELED" ? "Перевод остановлен: " : "Перевод готов: "}
        {resultText(r)}
      </span>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {r.applied > 0 && (
          <Button size="sm" variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={onOpenReview} data-testid="tr-ai-open-review">
            Открыть в «Проверить ИИ»
          </Button>
        )}
        {batch.retryable > 0 && (
          <Button
            size="sm"
            variant="outline"
            loading={retry.isPending}
            onClick={() => retry.mutate({ id: batch.id, idemKey: newIdemKey() })}
            data-testid="tr-ai-retry"
          >
            Повторить неудачные ({batch.retryable})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss} data-testid="tr-ai-dismiss">
          Скрыть
        </Button>
      </div>
    </div>
  );
}
