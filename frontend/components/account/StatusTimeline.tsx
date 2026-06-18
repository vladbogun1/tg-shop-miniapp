"use client";

/** Vertical status timeline (Принят → Одобрен → Отправлен → Доставлен). */
import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import { ORDER_STATUS_LABEL, ORDER_TIMELINE } from "@/lib/format";

export function StatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-[var(--accent-ink)]">
          ✕
        </span>
        <span className="text-[14px] font-medium text-[var(--danger)]">
          Заказ отклонён
        </span>
      </div>
    );
  }

  const currentIdx = ORDER_TIMELINE.indexOf(status);

  return (
    <div className="flex flex-col">
      {ORDER_TIMELINE.map((s, i) => {
        const done = i <= currentIdx;
        const isLast = i === ORDER_TIMELINE.length - 1;
        return (
          <div key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] transition-colors"
                style={{
                  background: done ? "var(--accent)" : "var(--glass-bg)",
                  color: done ? "var(--accent-ink)" : "var(--text-faint)",
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {!isLast && (
                <span
                  className="my-0.5 w-0.5 flex-1 rounded-full"
                  style={{
                    minHeight: 18,
                    background: i < currentIdx ? "var(--accent)" : "rgba(255,255,255,.12)",
                  }}
                />
              )}
            </div>
            <span
              className="pb-3 pt-0.5 text-[14px]"
              style={{ color: done ? "var(--text)" : "var(--text-faint)" }}
            >
              {ORDER_STATUS_LABEL[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
