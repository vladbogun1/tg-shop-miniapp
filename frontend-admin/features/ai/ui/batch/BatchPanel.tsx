"use client";

import type { ReactNode } from "react";
import type { AiBatch } from "../../api-batch";
import { isOpen } from "../../model/batch-view";
import { useAiBatches } from "../../queries-batch";
import { BatchBar } from "./BatchBar";
import { BatchSummary } from "./BatchSummary";

/**
 * Полоса пакетов над страницей: идущий или стоящий на паузе — `BatchBar`; закончившийся, у которого есть что
 * проверить, повторить или отменить, — `BatchSummary`. Что делать с результатом (лента, «Принять безопасное»), знает
 * предмет пакета, поэтому вызывающий отдаёт `onReview` и `acceptSafe`.
 */
export function BatchPanel({ onReview, acceptSafe }: { onReview: (batch: AiBatch) => void; acceptSafe: (batch: AiBatch) => ReactNode }) {
  const { data } = useAiBatches();
  if (!data || data.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="batch-panel">
      {data.map((b) =>
        isOpen(b) ? (
          <BatchBar key={b.id} batch={b} onReview={() => onReview(b)} />
        ) : (
          <BatchSummary key={b.id} batch={b} onReview={() => onReview(b)} acceptSafe={acceptSafe(b)} />
        ),
      )}
    </div>
  );
}

/** Пропускает детей, только пока у админа есть пакеты: тяжёлый экран пакетов не грузится зря на каждой странице. */
export function BatchGate({ children }: { children: ReactNode }) {
  const { data } = useAiBatches();
  return data && data.length > 0 ? <>{children}</> : null;
}
