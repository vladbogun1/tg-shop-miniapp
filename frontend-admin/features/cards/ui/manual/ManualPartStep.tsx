"use client";

import { CopyButton } from "@/features/translation";
import { Button } from "@shop/ui/admin-button";
import { toast } from "@shop/ui/toast";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardPaste } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MANUAL_PART_SIZES, partRange } from "../../model/manual-batch";
import { Step } from "../shared";
import type { ManualBatchState } from "./use-manual-batch";

const FIELD =
  "w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]";

function Problems({ errors, notes }: { errors: string[]; notes: string[] }) {
  if (errors.length === 0 && notes.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-[12.5px] leading-snug" data-testid="manual-part-problems">
      {errors.map((e) => (
        <li key={e} className="break-words text-[var(--danger-ink)]">
          {e}
        </li>
      ))}
      {notes.map((e) => (
        <li key={e} className="break-words text-[var(--text-muted)]">
          {e}
        </li>
      ))}
    </ul>
  );
}

/** «Товаров в части: 4 · 8» — пока ничего не вставлено: ответы привязаны к частям. */
function PartSize({ m }: { m: ManualBatchState }) {
  const d = m.draft;
  if (!d || [...d.answers, ...d.sent].some((a) => a.trim()) || (m.batch?.items.length ?? 0) <= MANUAL_PART_SIZES[0]) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]" role="group" aria-label="Товаров в части">
      <span>Товаров в части:</span>
      {MANUAL_PART_SIZES.map((n) => (
        <Button key={n} size="sm" variant={d.size === n ? "accent" : "surface"} aria-pressed={d.size === n} onClick={() => m.setSize(n)} data-testid={`manual-size-${n}`}>
          {n}
        </Button>
      ))}
      <span className="basis-full text-[12px] text-[var(--text-faint)] sm:basis-auto">По 8 быстрее, но длинный ответ ChatGPT чаще обрывается.</span>
    </div>
  );
}

/** «Назад» и «Дальше: часть N»; на последней части — «К проверке (N)». */
function PartNav({ m, part, total, answered }: { m: ManualBatchState; part: number; total: number; answered: boolean }) {
  const n = part + 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="surface" icon={<ChevronLeft className="h-4 w-4" />} disabled={part === 0 || m.busy} onClick={() => void m.goPart(part - 1)}>
        Назад
      </Button>
      {part === total - 1 ? (
        <Button variant="accent" loading={m.busy} disabled={m.pending === 0} onClick={() => void m.toReview()} data-testid="manual-to-review">
          К проверке ({m.pending})
        </Button>
      ) : (
        <Button
          variant={answered ? "accent" : "surface"}
          loading={m.busy}
          iconRight={<ChevronRight className="h-4 w-4" />}
          onClick={() => void m.goPart(part + 1)}
          data-testid="manual-next"
        >
          Дальше: часть {n + 1}
        </Button>
      )}
    </div>
  );
}

function PromptBlock({ m, part }: { m: ManualBatchState; part: number }) {
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState<ReadonlySet<number>>(new Set());
  const items = m.partItems(part);
  const size = m.current?.size ?? 0;
  const n = part + 1;
  return (
    <Step n={1} title="Скопируйте промпт">
      <ul className="mb-3 flex min-w-0 flex-col gap-1 text-[13px] text-[var(--text)]" aria-label={`Товары части ${n}`}>
        {items.map((i) => (
          <li key={i.id} className="min-w-0 truncate" title={i.title}>
            {i.title}
          </li>
        ))}
        {items.length < size && <li className="text-[var(--text-faint)]">Пропавших из каталога: {size - items.length}</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton
          text={m.prompt}
          label="Скопировать промпт"
          copiedLabel="Скопировать снова"
          ariaLabel={`Скопировать промпт части ${n}`}
          variant={copied.has(part) || m.draft?.answers[part] ? "surface" : "accent"}
          copied={copied.has(part)}
          onCopied={() => setCopied(new Set(copied).add(part))}
        />
        <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)} iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview && "rotate-180")} />}>
          {preview ? "Скрыть текст" : "Показать текст"}
        </Button>
      </div>
      {preview && (
        <pre className="thin-scroll mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]">
          {m.prompt}
        </pre>
      )}
    </Step>
  );
}

function AnswerBlock({ m, part }: { m: ManualBatchState; part: number }) {
  const c = m.current;
  const answer = m.draft?.answers[part] ?? "";
  if (!c) return null;

  async function pasteFromClipboard() {
    try {
      m.setAnswer(await navigator.clipboard.readText());
    } catch {
      toast.info("Браузер не дал прочитать буфер — вставьте Ctrl+V");
    }
  }

  return (
    <Step n={2} title="Вставьте ответ ChatGPT">
      <textarea
        value={answer}
        onChange={(e) => m.setAnswer(e.target.value)}
        rows={7}
        spellCheck={false}
        aria-label={`Ответ ChatGPT на часть ${part + 1}`}
        placeholder={'Ответ целиком — блок ```json { "p…": { "specs": …, "confidence": …, … } } ```'}
        className={cn(FIELD, "thin-scroll resize-y font-mono text-[12px] leading-relaxed")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => void pasteFromClipboard()}>
          Вставить из буфера
        </Button>
        {answer && (
          <span className={cn("text-[13px] font-semibold", c.answered === c.size ? "text-[var(--ok)]" : "text-[var(--warn)]")} data-testid="manual-part-answered">
            Разобрано {c.answered} из {c.size}
          </span>
        )}
      </div>
      <Problems errors={c.errors} notes={c.notes} />
      <label className="mt-3 flex min-w-0 flex-col gap-1 text-[12.5px] text-[var(--text-muted)]">
        Модель ChatGPT (необязательно)
        <input
          value={m.draft?.model ?? ""}
          onChange={(e) => m.setModel(e.target.value)}
          placeholder="Например, GPT-5 Thinking"
          maxLength={60}
          className={cn(FIELD, "h-10 py-0 text-[13px] sm:max-w-[320px]")}
          data-testid="manual-model"
        />
      </label>
    </Step>
  );
}

/** Часть ручного пакета по макету 03-batch D: промпт части → ответ ChatGPT → «Дальше: часть N». */
export function ManualPartStep({ m }: { m: ManualBatchState }) {
  if (!m.draft || !m.current) return null;
  const { part, answers, size } = m.draft;
  const total = answers.length;
  const c = m.current;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-4 min-w-0">
        <h2 className="font-display text-[20px] font-bold text-[var(--ink)]" data-testid="manual-part-title">
          Вручную: часть {part + 1} из {total}
        </h2>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]" data-testid="manual-part-sub">
          {partRange(part, size, m.parts[part]?.length ?? 0)}. Вставлено {c.answered} из {c.size} {c.size === 1 ? "ответа" : "ответов"}.
        </p>
      </div>
      <PartSize m={m} />
      <PromptBlock m={m} part={part} />
      <AnswerBlock m={m} part={part} />
      <PartNav m={m} part={part} total={total} answered={!!answers[part]} />
    </div>
  );
}
