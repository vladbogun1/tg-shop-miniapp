"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import type { AiJob } from "../api";
import { elapsedClock, isSlow } from "../model/job-state";

/** Ход работы: таймер, понятный человеку этап и подсказка про «можно закрыть». Слов «DONE/ходы» здесь нет. */
export function JobProgress({ job, onCancel, cancelling }: { job: AiJob; onCancel: () => void; cancelling: boolean }) {
  const [tick, setTick] = useState(() => nowMs());
  useEffect(() => {
    const t = setInterval(() => setTick(nowMs()), 1000);
    return () => clearInterval(t);
  }, []);
  const queued = job.status === "QUEUED";
  const slow = isSlow(job.createdAt, tick);
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[var(--ink)]">{queued ? "Ждёт своей очереди" : "ИИ ищет данные и заполняет карточку"}</div>
          <div className="text-[12px] tabular-nums text-[var(--text-muted)]">Идёт {elapsedClock(job.createdAt, tick)}</div>
        </div>
      </div>
      {slow && <p className="text-[12px] text-[var(--warn)]">Это дольше обычного. Можно подождать или остановить и заполнить вручную.</p>}
      <p className="text-[12px] leading-snug text-[var(--text-muted)]">
        Окно можно закрыть: задача продолжится, а готовый результат ждёт под значком ✦ вверху.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onCancel} loading={cancelling} disabled={job.cancelRequested}>
          {job.cancelRequested ? "Останавливаю…" : "Остановить"}
        </Button>
      </div>
    </div>
  );
}
