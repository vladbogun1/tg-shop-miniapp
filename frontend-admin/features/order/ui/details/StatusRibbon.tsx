"use client";

/**
 * Тонкая линейка статусов вместо «Таймлайна»: Создан → Одобрен → Отправлен → Доставлен (+ «Отклонён» веткой).
 * Дата шага — по тапу (строка под линейкой); полный журнал остаётся во вкладке «История».
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import type { OrderStatus } from "@shop/core/types";
import type { AdminOrderDetail } from "../../api";
import { STATUS_LABEL, STATUS_VAR, TIMELINE_STATUSES, statusTimestamp } from "../../model/status";

export function StatusRibbon({ order }: { order: AdminOrderDetail }) {
  const rejected = order.status === "REJECTED";
  const reachedIdx = rejected ? 0 : TIMELINE_STATUSES.indexOf(order.status);
  const steps: OrderStatus[] = rejected ? [...TIMELINE_STATUSES.slice(0, 1), "REJECTED"] : TIMELINE_STATUSES;
  const [picked, setPicked] = useState<OrderStatus | null>(null);
  const ts = picked ? statusTimestamp(order, picked) : null;

  return (
    <div className="card px-3 py-2">
      <ol className="flex items-center gap-1" aria-label="Ход заказа">
        {steps.map((s, i) => {
          const done = s === "REJECTED" || i <= reachedIdx;
          const color = STATUS_VAR[s];
          // Narrow phone: only the current step keeps its word, the rest are dots (full name in the tooltip/tap line).
          const current = rejected ? s === "REJECTED" : i === reachedIdx;
          return (
            <li key={s} className={cn("flex min-w-0 flex-1 items-center gap-1", current && "max-[479px]:flex-none")}>
              <button
                type="button"
                onClick={() => setPicked(picked === s ? null : s)}
                aria-pressed={picked === s}
                title={STATUS_LABEL[s]}
                aria-label={STATUS_LABEL[s]}
                className={cn(
                  "font-display hit flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-1 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors pointer-coarse:min-h-11",
                  picked === s && "bg-[var(--surface-3)]",
                )}
                style={{ color: done ? color : "var(--text-faint)" }}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: done ? color : "transparent",
                    boxShadow: done ? undefined : "inset 0 0 0 1.5px var(--line-strong)",
                  }}
                />
                <span className={cn("truncate", !current && "max-[479px]:hidden")}>{STATUS_LABEL[s]}</span>
              </button>
              {i < steps.length - 1 && <span aria-hidden className="h-px w-3 shrink-0 bg-[var(--line-strong)]" />}
            </li>
          );
        })}
      </ol>
      {picked && (
        <p className="tabular px-1 pb-0.5 pt-1 text-[12px] text-[var(--text-muted)]">
          {STATUS_LABEL[picked]}: {ts ? formatDateTime(ts) : "ещё не наступил"}
        </p>
      )}
    </div>
  );
}
