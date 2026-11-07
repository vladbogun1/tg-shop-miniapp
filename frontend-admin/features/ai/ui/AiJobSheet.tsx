"use client";

/**
 * Шторка (телефон) / окно (ПК) запуска задачи ИИ: подтверждение при необходимости → ход → результат.
 * Двойной запуск («уже идёт» — 409 `AI_JOB_ACTIVE`) не плодит вторую задачу, а ведёт к текущей. Закрытие окна не
 * останавливает задачу: готовый результат ждёт под чипом ✦ в шапке.
 */
import { errorMessage, hasErrorCode } from "@shop/core/errors";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aiApi, type AiJob } from "../api";
import { newIdemKey } from "../model/idem";
import { canRetry, isActive } from "../model/job-state";
import { useAiJob, useCancelJob, useRetryJob } from "../queries";
import { JobProgress } from "./JobProgress";
import { JobFailure } from "./JobFailure";

export interface AiJobSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Предмет задачи (id товара): по нему находим уже идущую задачу. */
  subjectId: string;
  /** Запуск; `idemKey` — один на открытие окна. */
  start: (idemKey: string) => Promise<AiJob>;
  /** Если задан, перед запуском показывается этот текст и кнопка «Запустить». */
  confirmText?: string;
  /** Куда вести, когда результат готов. */
  reviewHref: (job: AiJob) => string;
  onManual: () => void;
}

type Phase = { kind: "confirm" } | { kind: "starting" } | { kind: "job"; id: number } | { kind: "active"; id: number } | { kind: "error"; text: string };

export function AiJobSheet(p: AiJobSheetProps) {
  const { open, onClose, start } = p;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: p.confirmText ? "confirm" : "starting" });
  const key = useRef(newIdemKey());
  const started = useRef(false);

  async function run() {
    setPhase({ kind: "starting" });
    try {
      const job = await start(key.current);
      setPhase({ kind: "job", id: job.id });
    } catch (e) {
      if (hasErrorCode(e, "AI_JOB_ACTIVE")) {
        const current = (await aiApi.active().catch(() => [])).find((j) => j.subjectId === p.subjectId);
        if (current) return setPhase({ kind: "active", id: current.id });
      }
      setPhase({ kind: "error", text: errorMessage(e, undefined, "Не удалось запустить ИИ") });
    }
  }

  const runRef = useRef(run);
  runRef.current = run;
  const needsConfirm = !!p.confirmText;
  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    key.current = newIdemKey();
    setPhase({ kind: needsConfirm ? "confirm" : "starting" });
    if (!needsConfirm && !started.current) {
      started.current = true;
      void runRef.current();
    }
  }, [open, needsConfirm]);

  return (
    <Modal open={open} onClose={onClose} size="dialog" title={p.title}>
      <SheetBody p={p} phase={phase} setPhase={setPhase} run={run} router={router} />
    </Modal>
  );
}

function SheetBody({ p, phase, setPhase, run, router }: { p: AiJobSheetProps; phase: Phase; setPhase: (x: Phase) => void; run: () => void; router: ReturnType<typeof useRouter> }) {
  if (phase.kind === "confirm") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-snug text-[var(--text-muted)]">{p.confirmText}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={run}>Запустить</Button>
          <Button variant="ghost" onClick={p.onClose}>Отмена</Button>
        </div>
      </div>
    );
  }
  if (phase.kind === "starting") return <div className="py-6 text-center text-[13px] text-[var(--text-muted)]">Запускаю…</div>;
  if (phase.kind === "error") return <JobFailure text={phase.text} onManual={p.onManual} />;
  return <JobView id={phase.id} already={phase.kind === "active"} p={p} setPhase={setPhase} router={router} />;
}

function JobView({ id, already, p, setPhase, router }: { id: number; already: boolean; p: AiJobSheetProps; setPhase: (x: Phase) => void; router: ReturnType<typeof useRouter> }) {
  const q = useAiJob(id);
  const cancel = useCancelJob();
  const retry = useRetryJob();
  const job = q.data;
  if (!job) return <div className="py-6 text-center text-[13px] text-[var(--text-muted)]">Загружаю задачу…</div>;
  if (isActive(job.status)) {
    return (
      <div className="flex flex-col gap-3">
        {already && <div className="rounded-[var(--r-sm)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--text)]">Уже идёт: это товар уже оформляется — показываю текущую задачу.</div>}
        <JobProgress job={job} onCancel={() => cancel.mutate(job.id)} cancelling={cancel.isPending} />
      </div>
    );
  }
  if (job.status === "DONE") {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[14px] font-semibold text-[var(--ok)]">Готово — проверьте, что предложил ИИ</div>
        <p className="text-[12px] text-[var(--text-muted)]">Ничего не изменится, пока вы не нажмёте «Применить».</p>
        <div>
          <Button variant="accent" onClick={() => { p.onClose(); router.push(p.reviewHref(job)); }}>Открыть проверку</Button>
        </div>
      </div>
    );
  }
  return (
    <JobFailure
      job={job}
      onManual={p.onManual}
      onRetry={canRetry(job) ? () => retry.mutate(job.id, { onSuccess: (j) => setPhase({ kind: "job", id: j.id }) }) : undefined}
      retrying={retry.isPending}
    />
  );
}
