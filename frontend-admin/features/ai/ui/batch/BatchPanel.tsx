"use client";

import type { ReactNode } from "react";
import type { AiBatch } from "../../api-batch";
import { isManualDraft, isOpen } from "../../model/batch-view";
import { useAiBatches } from "../../queries-batch";
import { BatchBar } from "./BatchBar";
import { BatchSummary } from "./BatchSummary";

/**
 * Полоса пакетов над страницей: идущий или стоящий на паузе — `BatchBar`; закончившийся, у которого есть что
 * проверить, повторить или отменить, — `BatchSummary`. Что делать с результатом (лента, «Принять безопасное»), знает
 * предмет пакета, поэтому вызывающий отдаёт `onReview` и `acceptSafe`.
 */
export function BatchPanel({
  onReview,
  acceptSafe,
  manual,
  skipSummary,
}: {
  onReview: (batch: AiBatch) => void;
  acceptSafe: (batch: AiBatch) => ReactNode;
  /** Кнопка ручного пути для того, что ИИ не сделал (пакет на паузе или закончился); её знает предмет пакета. */
  manual?: (batch: AiBatch) => ReactNode;
  /** Итог такого пакета рисует его экран сам (переводы): здесь остаётся только полоса хода. */
  skipSummary?: (batch: AiBatch) => boolean;
}) {
  const { data } = useAiBatches();
  // Незаконченный ручной пакет ведёт свой слой и полоса «Продолжить» на «Товарах» и «Карточках».
  const shown = (data ?? []).filter((b) => !isManualDraft(b));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="batch-panel">
      {shown.map((b) =>
        isOpen(b) ? (
          <BatchBar key={b.id} batch={b} onReview={() => onReview(b)} manual={manual?.(b)} />
        ) : skipSummary?.(b) ? null : (
          <BatchSummary key={b.id} batch={b} onReview={() => onReview(b)} acceptSafe={acceptSafe(b)} manual={manual?.(b)} />
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
