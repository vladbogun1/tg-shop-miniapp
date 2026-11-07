"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Свёрнутая карточка карточки заказа: заголовок и сводка в одной строке (≥ 44 px на тач), содержимое по тапу.
 * Для редкого (журнал денег, возвраты, прибыль): суть видна, не разворачивая. Нативный `<details>` — без состояния.
 */
export function Fold({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="card group" open={defaultOpen || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">{title}</h3>
        <span className="tabular flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          {summary != null && <span className="min-w-0 truncate">{summary}</span>}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
