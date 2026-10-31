"use client";

import { ClipboardPaste, Wand2, X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { Step } from "../shared";
import { AnswerNotices } from "./AnswerNotices";
import type { AnswerReview } from "./use-answer-review";

/** Шаг 2: вставить ответ ИИ (можно ответы на несколько пакетов подряд) и проверить. */
export function WizardAnswer({ a }: { a: AnswerReview }) {
  const { answer, setAnswer, model, setModel, reviews, check, clearAnswer } = a;
  return (
    <Step n={2} title="Ответ ИИ">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          const el = e.currentTarget;
          const next = answer.slice(0, el.selectionStart) + pasted + answer.slice(el.selectionEnd);
          window.setTimeout(() => check(next), 0);
        }}
        rows={7}
        spellCheck={false}
        aria-label="Ответ ИИ"
        placeholder={'Вставьте сюда ответ целиком — блок ```json { "p…": { "specs": …, "confidence": …, … } } ```.\nМожно вставить ответы на несколько пакетов подряд.'}
        className="thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={reviews || !answer.trim() ? "surface" : "accent"} icon={<Wand2 className="h-4 w-4" />} onClick={() => check()} disabled={!answer.trim()}>
          Проверить
        </Button>
        <Button
          variant="outline"
          icon={<ClipboardPaste className="h-4 w-4" />}
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              setAnswer(t);
              check(t);
            } catch {
              toast.info("Браузер не дал прочитать буфер — вставьте Ctrl+V");
            }
          }}
        >
          Вставить из буфера
        </Button>
        {answer && (
          <Button
            variant="ghost"
            icon={<X className="h-4 w-4" />}
            onClick={clearAnswer}
          >
            Очистить
          </Button>
        )}
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Модель ИИ (необязательно)"
          aria-label="Модель ИИ"
          className="ml-auto h-10 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] sm:w-[240px]"
        />
      </div>
      <AnswerNotices a={a} />
    </Step>
  );
}
