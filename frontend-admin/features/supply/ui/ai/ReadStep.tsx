"use client";

import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { ClipboardPaste, Wand2, X } from "lucide-react";
import { CopyButton } from "@/features/translation";
import { EXTRACT_PROMPT } from "../../model/ai/extract-prompt";
import type { SupplyAi } from "./use-supply-ai";

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

/** Шаг 1: скопировать промпт, приложить документ в чате ИИ, вставить ответ. */
export function ReadStep({ ai }: { ai: SupplyAi }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="field-label mb-1.5">1 · Промпт</div>
        <p className="mb-2 text-[13px] text-[var(--text-muted)]">
          Скопируйте промпт в ChatGPT, Claude или Gemini и приложите к сообщению накладную (PDF, фото) или скриншоты заказа Taobao. Каталог в промпт не входит — сопоставлять будет админка.
        </p>
        <CopyButton text={EXTRACT_PROMPT} variant={ai.answer ? "surface" : "accent"} />
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
