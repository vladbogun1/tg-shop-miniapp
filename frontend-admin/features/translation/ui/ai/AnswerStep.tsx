"use client";

/** «Перевод через ИИ», шаг 2: вставить ответ ИИ, проверить, увидеть, что с ним не так. */
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { ClipboardPaste, Wand2, X } from "lucide-react";
import type { AiSession } from "./use-ai-session";

function Problems({ ai }: { ai: AiSession }) {
  const { parseErrors, notes, unknown, invalid, missing } = ai.problems;
  if (!(parseErrors.length || notes.length || unknown.length || invalid.length || missing.length)) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5 text-[13px] font-semibold">
      {parseErrors.map((e, i) => (
        <div key={i} className="text-[var(--danger-ink)]">✕ {e}</div>
      ))}
      {unknown.length > 0 && (
        <div className="text-[var(--danger-ink)]">
          ✕ Неизвестные id ({unknown.length}) — исключены (оригинал изменился или ИИ исказил id):{" "}
          <span className="font-mono">{unknown.slice(0, 12).join(", ")}{unknown.length > 12 ? "…" : ""}</span>
        </div>
      )}
      {invalid.map((x) => (
        <div key={x.id} className="text-[var(--danger-ink)]">
          ✕ <span className="font-mono">{x.id}</span>: {x.problems.join("; ")} — исключено
        </div>
      ))}
      {missing.length > 0 && (
        <div className="text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
          ! Нет в ответе {missing.length} строк из отправленных частей — попросите ИИ дописать их или скопируйте часть ещё раз:{" "}
          <span className="font-mono">{missing.slice(0, 12).join(", ")}{missing.length > 12 ? "…" : ""}</span>
        </div>
      )}
      {notes.map((n, i) => (
        <div key={i} className="text-[var(--text-muted)]">ℹ Исправлено автоматически: {n}</div>
      ))}
    </div>
  );
}

export function AnswerStep({ ai }: { ai: AiSession }) {
  const { answer, rows } = ai;
  return (
    <>
      <textarea
        value={answer}
        onChange={(e) => ai.setAnswer(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          const el = e.currentTarget;
          const next = answer.slice(0, el.selectionStart) + pasted + answer.slice(el.selectionEnd);
          window.setTimeout(() => ai.check(next), 0);
        }}
        rows={7}
        spellCheck={false}
        placeholder={'Вставьте сюда ответ целиком — блок ```json { "t…": { "ru": …, "uk": …, "en": … } } ```.\nМожно вставить ответы на несколько частей подряд.'}
        className="thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={rows || !answer.trim() ? "surface" : "accent"} icon={<Wand2 className="h-4 w-4" />} onClick={() => ai.check()} disabled={!answer.trim()}>
          Проверить ответ
        </Button>
        <Button
          variant="outline"
          icon={<ClipboardPaste className="h-4 w-4" />}
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              ai.setAnswer(t);
              ai.check(t);
            } catch {
              toast.info("Браузер не дал прочитать буфер — вставьте Ctrl+V");
            }
          }}
        >
          Вставить из буфера
        </Button>
        {answer && (
          <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={ai.clearAnswer}>
            Очистить
          </Button>
        )}
      </div>
      <Problems ai={ai} />
    </>
  );
}
