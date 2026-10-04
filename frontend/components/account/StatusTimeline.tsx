"use client";

/**
 * StatusTimeline — ChiSetup vertical timeline of the order lifecycle
 * (NEW → APPROVED → SHIPPED → DELIVERED). Done steps are tinted with their status colour; the
 * CURRENT step glows softly and pulses. REJECTED is a distinct danger-tinted block.
 *
 * Uses ORDER_TIMELINE / ORDER_STATUS_LABEL / ORDER_STATUS_COLOR from lib/format.
 */
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import {
  ORDER_STATUS_COLOR,
  ORDER_TIMELINE,
} from "@/lib/format";
import { useT } from "@/i18n/context";

export function StatusTimeline({ status }: { status: OrderStatus }) {
  const t = useT();
  if (status === "REJECTED") {
    return (
      <div
        className="flex items-center gap-3 rounded-[var(--r-card)] border p-4"
        style={{
          background: "color-mix(in srgb, var(--danger) 12%, var(--surface))",
          borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)",
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger)] text-white">
          <X className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="nb-up text-[14px] font-bold text-[var(--danger)]">
            {t("timeline.rejected.title")}
          </p>
          <p className="text-[12px] text-[var(--ink)]/80">
            {t("timeline.rejected.text")}
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
                className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold"
                style={{
                  background: done ? `color-mix(in srgb, ${stepColor} 18%, transparent)` : "var(--surface-2)",
                  borderColor: done ? stepColor : "var(--line)",
                  color: done ? stepColor : "var(--faint)",
                  boxShadow: isCurrent ? `0 0 14px -2px ${stepColor}` : "none",
                }}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </motion.span>
              {!isLast && (
                <span
                  className="my-1 w-[2px] flex-1 rounded-full"
                  style={{
                    minHeight: 22,
                    background: i < currentIdx ? stepColor : "var(--line-strong)",
                    opacity: i < currentIdx ? 0.7 : 1,
                  }}
                />
              )}
            </div>
            <div className="pb-4 pt-1">
              <span
                className="font-display text-[14px] font-semibold"
                style={{
                  color: done ? "var(--ink)" : "var(--faint)",
                }}
              >
                {t(`status.${s}`)}
              </span>
              {isCurrent && (
                <p className="nb-up text-[11px] font-semibold text-[var(--accent)]">
                  {t("timeline.current")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
