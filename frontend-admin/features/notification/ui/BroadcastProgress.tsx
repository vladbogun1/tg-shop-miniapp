"use client";

import { Button } from "@shop/ui/admin-button";
import { motion } from "framer-motion";
import { Square } from "lucide-react";
import { spring } from "@/lib/motion";
import { progressPercent, progressTitle, stoppedSummary } from "../model/progress";
import { useStopBroadcast } from "../queries";

interface Props {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  /** «Остановить» нажата, поток дозавершается. */
  stopRequested?: boolean;
  /** Закончилась остановкой: остальное не отправлено. */
  stopped?: boolean;
  stoppedBy?: string | null;
}

export function BroadcastProgress({ running, total, sent, failed, blocked, stopRequested = false, stopped = false, stoppedBy }: Props) {
  const { requestStop, stopping } = useStopBroadcast();
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
          {progressTitle({ running, stopRequested, stopped })}
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
      {stopped && (
        <p className="text-[12px] font-semibold text-[var(--warn)]">
          {stoppedSummary(done, total, sent)}
          {stoppedBy ? ` · остановил(а): ${stoppedBy}` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[12px]">
        <span className="text-[var(--ok)]">✓ Доставлено: {sent}</span>
        <span className="text-[var(--danger-ink)]">✕ Ошибок: {failed}</span>
        <span className="text-[var(--warn)]">⊘ Заблокировали: {blocked}</span>
        {running && (
          <Button variant="danger" size="sm" className="ml-auto" loading={stopping} disabled={stopRequested} icon={<Square className="h-3.5 w-3.5" />} onClick={requestStop}>
            {stopRequested ? "Останавливаем…" : "Остановить"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
