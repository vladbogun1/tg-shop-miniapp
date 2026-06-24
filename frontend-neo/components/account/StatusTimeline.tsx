"use client";

/**
 * StatusTimeline — NEO-BRUTALISM vertical timeline of the order lifecycle
 * (NEW → APPROVED → SHIPPED → DELIVERED). Steps are bordered ink tiles filled
 * with the per-status accent once done; the CURRENT step is highlighted with a
 * hard offset shadow + pulse. REJECTED is a distinct danger block.
 *
 * Uses ORDER_TIMELINE / ORDER_STATUS_LABEL / ORDER_STATUS_COLOR from lib/format.
 */
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import {
  ORDER_STATUS_COLOR,
  ORDER_STATUS_LABEL,
  ORDER_TIMELINE,
} from "@/lib/format";

export function StatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "REJECTED") {
    return (
      <div
        className="flex items-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] p-4 shadow-[5px_5px_0_var(--shadow)]"
        style={{ background: "var(--danger)" }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
          <X className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="nb-up text-[14px] font-black text-white">
            Заказ отклонён
          </p>
          <p className="text-[12px] font-semibold text-white/90">
            Заказ не был принят в обработку
          </p>
        </div>
      </div>
    );
  }

  const currentIdx = ORDER_TIMELINE.indexOf(status);

  return (
    <ol className="flex flex-col">
      {ORDER_TIMELINE.map((s, i) => {
        const done = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const isLast = i === ORDER_TIMELINE.length - 1;
        const stepColor = ORDER_STATUS_COLOR[s];

        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <motion.span
                initial={false}
                animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={
                  isCurrent
                    ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                    : { type: "spring", stiffness: 400, damping: 28 }
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] text-[12px] font-black"
                style={{
                  background: done ? stepColor : "var(--surface-2)",
                  color: done ? "var(--ink)" : "var(--faint)",
                  boxShadow: isCurrent
                    ? "3px 3px 0 var(--shadow)"
                    : "none",
                }}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </motion.span>
              {!isLast && (
                <span
                  className="my-1 w-[3px] flex-1"
                  style={{
                    minHeight: 22,
                    background:
                      i < currentIdx ? stepColor : "var(--line)",
                    opacity: i < currentIdx ? 1 : 0.4,
                  }}
                />
              )}
            </div>
            <div className="pb-4 pt-1">
              <span
                className="text-[14px] font-extrabold"
                style={{
                  color: done ? "var(--ink)" : "var(--faint)",
                }}
              >
                {ORDER_STATUS_LABEL[s]}
              </span>
              {isCurrent && (
                <p className="nb-up text-[11px] font-black text-[var(--accent)]">
                  Текущий статус
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
