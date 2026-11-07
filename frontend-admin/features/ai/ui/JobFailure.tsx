"use client";

import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import type { AiJob } from "../api";

const BY_STATUS: Record<string, string> = {
  EMPTY: "ИИ не нашёл данных по этому товару.",
  BAD_ANSWER: "Ответ ИИ не удалось прочитать.",
  FAILED: "Задача завершилась сбоем.",
  CANCELED: "Задача остановлена.",
};

/** Итог без результата: что случилось, «Показать ответ», повтор и ручной путь. */
export function JobFailure({ job, text, onManual, onRetry, retrying }: { job?: AiJob; text?: string; onManual: () => void; onRetry?: () => void; retrying?: boolean }) {
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[14px] font-semibold text-[var(--ink)]">{text ?? BY_STATUS[job?.status ?? "FAILED"]}</div>
      {job?.errorNote && <p className="text-[12px] text-[var(--text-muted)]">{job.errorNote}</p>}
      {job?.answer && (
        <div>
          <button type="button" className="text-[12.5px] font-semibold text-[var(--accent)]" onClick={() => setShowAnswer((v) => !v)}>
            {showAnswer ? "Скрыть ответ" : "Показать ответ"}
          </button>
          {showAnswer && (
            <pre className="thin-scroll mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-sm)] bg-[var(--surface-2)] p-3 text-[11.5px] text-[var(--text)]">{job.answer}</pre>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {onRetry && <Button variant="accent" onClick={onRetry} loading={retrying}>Повторить тщательнее</Button>}
        <Button variant={onRetry ? "surface" : "accent"} onClick={onManual}>Через ChatGPT вручную</Button>
      </div>
    </div>
  );
}
