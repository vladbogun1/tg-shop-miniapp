"use client";

import { ClipboardPaste, Wand2, X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import type { CardCompletion } from "./use-card-completion";

/** Шаг 2: вставить ответ ИИ и проверить его. */
export function AnswerStep({ c }: { c: CardCompletion }) {
  const { answer, setAnswer, model, setModel, errors, notes, review, check, clearAnswer } = c;
  return (
    <div>
      <div className="field-label mb-2">2 · Ответ ИИ</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          const el = e.currentTarget;
          const next = answer.slice(0, el.selectionStart) + pasted + answer.slice(el.selectionEnd);
          window.setTimeout(() => check(next), 0);
        }}
        rows={5}
        spellCheck={false}
        aria-label="Ответ ИИ"
        placeholder={'Вставьте ответ целиком — блок ```json { "p…": { … } } ```'}
        className="thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant={review || !answer.trim() ? "surface" : "accent"} size="sm" icon={<Wand2 className="h-4 w-4" />} onClick={() => check()} disabled={!answer.trim()}>
          Проверить
        </Button>
        <Button
          variant="outline"
          size="sm"
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
            size="sm"
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
          className="ml-auto h-8 w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] sm:w-[200px]"
        />
      </div>
      {(errors.length > 0 || notes.length > 0) && (
        <div className="mt-2 flex flex-col gap-1 text-[13px] font-semibold">
          {errors.map((e, i) => (
            <div key={i} className="text-[var(--danger-ink)]">✕ {e}</div>
          ))}
          {notes.map((n, i) => (
            <div key={i} className="text-[var(--text-muted)]">ℹ Исправлено автоматически: {n}</div>
          ))}
        </div>
      )}
    </div>
  );
}
