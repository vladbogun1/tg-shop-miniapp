"use client";

import { motion } from "framer-motion";
import { spring } from "@/lib/motion";
import { progressPercent } from "../model/progress";

interface Props {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
}

export function BroadcastProgress({ running, total, sent, failed, blocked }: Props) {
  const done = sent + failed + blocked;
  const pct = progressPercent(done, total);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="card-2 mt-1 flex flex-col gap-2 rounded-[var(--r-md)] p-4"
    >
      <div className="flex items-center justify-between text-[13px]">
        <span className="section-title">
          {running ? "Идёт рассылка…" : "Рассылка завершена"}
        </span>
        <span className="tabular font-semibold text-[var(--text-muted)]">
          {done} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <motion.div
          className="h-full rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-[12px]">
        <span className="text-[var(--ok)]">✓ Доставлено: {sent}</span>
        <span className="text-[var(--danger-ink)]">✕ Ошибок: {failed}</span>
        <span className="text-[var(--warn)]">⊘ Заблокировали: {blocked}</span>
      </div>
    </motion.div>
  );
}
