"use client";

import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { ClipboardPaste, Wand2, X } from "lucide-react";
import { useState } from "react";
import { AiUnavailable } from "@/features/ai";
import { CopyButton } from "@/features/translation";
import { extractAdapter } from "../../model/ai/extract-prompt";
import { FilesPanel } from "./FilesPanel";
import { ReadWithAi, useReadReason } from "./ReadWithAi";
import type { SupplyAi } from "./use-supply-ai";
import type { SupplyFiles } from "./use-supply-files";

const AREA =
  "thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]";

/** Поле «вставьте ответ ИИ»: вставка сразу проверяется. Общее для шага 1 и шага 2. */
export function AnswerBox({
  value,
  onChange,
  onCheck,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCheck: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const el = e.currentTarget;
          const next = value.slice(0, el.selectionStart) + e.clipboardData.getData("text") + value.slice(el.selectionEnd);
          window.setTimeout(() => onCheck(next), 0);
        }}
        rows={4}
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        className={AREA}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant={value.trim() ? "accent" : "surface"} size="sm" icon={<Wand2 className="h-4 w-4" />} disabled={!value.trim()} onClick={() => onCheck(value)}>
          Проверить
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<ClipboardPaste className="h-4 w-4" />}
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              onChange(t);
              onCheck(t);
            } catch {
              toast.info("Браузер не дал прочитать буфер — вставьте Ctrl+V");
            }
          }}
        >
          Вставить из буфера
        </Button>
        {value && (
          <Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={() => onChange("")}>
            Очистить
          </Button>
        )}
      </div>
    </div>
  );
}

export function Messages({ errors, notes = [] }: { errors: string[]; notes?: string[] }) {
  if (errors.length === 0 && notes.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 text-[13px] font-semibold">
      {errors.map((e, i) => (
        <div key={`e${i}`} className="text-[var(--danger-ink)]">✕ {e}</div>
      ))}
      {notes.map((n, i) => (
        <div key={`n${i}`} className="text-[var(--text-muted)]">ℹ {n}</div>
      ))}
    </div>
  );
}

/** Ручной путь: скопировать промпт, приложить документ в чате ИИ, вставить ответ. Акцентный, пока встроенное чтение недоступно. */
function ManualPath({ ai, accent }: { ai: SupplyAi; accent: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="field-label mb-1.5">1 · Промпт</div>
        <p className="mb-2 text-[13px] text-[var(--text-muted)]">
          Скопируйте промпт в ChatGPT, Claude или Gemini и приложите к сообщению накладную (PDF, фото) или скриншоты заказа Taobao. Каталог в промпт не входит — сопоставлять будет админка.
        </p>
        <CopyButton text={extractAdapter.buildPrompt()} variant={accent && !ai.answer ? "accent" : "surface"} />
      </div>
      <div>
        <div className="field-label mb-1.5">2 · Ответ ИИ</div>
        <AnswerBox
          value={ai.answer}
          onChange={ai.setAnswer}
          onCheck={ai.check}
          label="Ответ ИИ"
          placeholder={'Вставьте ответ целиком — блок ```json { "supplier": …, "lines": [ … ] } ```'}
        />
        <Messages errors={ai.parsed?.errors ?? []} notes={ai.parsed?.notes.map((n) => `Исправлено автоматически: ${n}`)} />
      </div>
    </div>
  );
}

/**
 * Шаг 1. Любому админу поставок, пока ИИ доступен: файлы → «Прочитать с ИИ»; ручной путь спрятан под кнопкой. Если ИИ
 * недоступен или файлов нет — ручной путь акцентный (загрузка файлов без ИИ не нужна).
 */
export function ReadStep({ ai, files }: { ai: SupplyAi; files: SupplyFiles }) {
  const reason = useReadReason();
  const [manual, setManual] = useState(false);
  const builtIn = reason === null;
  const showManual = !builtIn || files.files.length === 0 || manual || !!ai.answer;
  const onAnswer = (text: string, jobId: number) => {
    ai.noteJob(jobId);
    ai.setAnswer(text);
    ai.check(text);
  };
  return (
    <div className="flex flex-col gap-4">
      {builtIn && (
        <>
          <FilesPanel files={files} locked={false} />
          <ReadWithAi files={files} onAnswer={onAnswer} onManual={() => setManual(true)} />
        </>
      )}
      {reason && <AiUnavailable reason={reason} />}
      {!showManual && (
        <div>
          <Button variant="surface" size="sm" onClick={() => setManual(true)}>
            Через ChatGPT вручную
          </Button>
        </div>
      )}
      {showManual && <ManualPath ai={ai} accent={!builtIn || files.files.length === 0} />}
    </div>
  );
}
