"use client";

/**
 * «Перевести через ИИ»: 1) prompt in parts → 2) paste the answer → 3) review / edit → confirm → save.
 * Runs for the texts the list showed when it was opened (`scope`); the parts are frozen for the
 * whole session so they do not renumber while the admin copies them one by one.
 * Saved translations land in «Проверить ИИ» — they are not «Готово» until a person accepts them.
 * The prompt text lives in model/prompt.ts, parsing/validation in model/{parse,check}.ts, state in use-ai-session.tsx.
 */
import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, Send } from "lucide-react";
import type { ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { plural } from "../../model/plural";
import type { WorkSet } from "../../model/workset";
import { AiReviewRow } from "./AiReviewRow";
import { AnswerStep } from "./AnswerStep";
import { PromptStep } from "./PromptStep";
import { SendSummaryView } from "./SendSummaryView";
import { replacesManual, useAiSession, type AiSession, type ReviewFilter } from "./use-ai-session";

function Step({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card mb-5 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="accent-tint font-display tabular grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] text-[14px] font-bold">
          {n}
        </span>
        <h2 className="section-title !text-[15px] text-[var(--ink)]">{title}</h2>
        {aside && <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function ReviewStep({ ai }: { ai: AiSession }) {
  const { rows, stats, selected, applyFix } = ai;
  if (!rows) return null;
  return (
    <Step
      n={3}
      title="Проверка и отправка"
      aside={
        <SegmentedControl<ReviewFilter>
          size="sm"
          value={ai.reviewFilter}
          onChange={ai.setReviewFilter}
          options={[
            { value: "all", label: "Все", count: rows.length },
            { value: "ok", label: "Без замечаний", count: stats.ok },
            { value: "warn", label: "Есть замечания", count: stats.warn },
            { value: "error", label: "Ошибки", count: stats.error },
            { value: "ru", label: "Правки оригинала", count: stats.ru },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <div className="text-[13px] font-semibold text-[var(--text-faint)]">
          {ai.summary ? "Всё отправлено." : "В ответе нет ни одной строки из текущего списка."}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-semibold text-[var(--text-muted)]">Отметить:</span>
            <Button size="sm" variant="outline" onClick={() => ai.select((r) => r.level === "ok" && !r.done && !replacesManual(r))}>
              Без замечаний
            </Button>
            <Button size="sm" variant="outline" onClick={() => ai.select((r) => r.level !== "error" && !r.done && !replacesManual(r))}>
              + с замечаниями
            </Button>
            <Button size="sm" variant="ghost" onClick={ai.clearSelected}>
              Снять все
            </Button>
            <span className="ml-auto text-[var(--text-muted)]">
              Строки с ошибками не сохраняются — исправьте текст прямо в поле, проверка обновится сразу.
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {ai.visibleRows.map((r) => (
              <AiReviewRow
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onSelect={(on) => ai.toggleSelected(r.id, on)}
                fix={applyFix.has(r.id)}
                onFix={(on) => ai.toggleFix(r.id, on)}
                onEdit={(patch) => ai.edit(r.id, patch)}
              />
            ))}
          </div>
        </>
      )}

      <div
        style={{ bottom: "var(--bottom-nav)" }}
        className="sticky z-10 -mx-4 mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:-mx-5 sm:px-5"
      >
        <Button variant="accent" chamfer size="lg" icon={<Send className="h-4 w-4" />} loading={ai.sending} disabled={ai.sendable.length === 0} onClick={() => void ai.send()}>
          Сохранить отмеченные · {ai.sendable.length}
        </Button>
        <span className="text-[12px] text-[var(--text-muted)]">Перед сохранением покажем, что именно изменится.</span>
        {applyFix.size > 0 && (
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">
            Правок оригинала: {Array.from(applyFix).filter((id) => selected.has(id)).length}
          </span>
        )}
      </div>

      {ai.summary && <SendSummaryView summary={ai.summary} />}
    </Step>
  );
}

export function AiTranslate({ ws, scope, onClose }: { ws: WorkSet; scope: string[]; onClose: () => void }) {
  const ai = useAiSession(ws, scope, onClose);
  const n = ai.chosen.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => void ai.leave()}>
          К списку
        </Button>
        <div className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Перевод через ИИ · <span className="tabular text-[var(--text)]">{n}</span> {plural(n, "текст", "текста", "текстов")}
        </div>
      </div>

      <Step n={1} title="Промпт для ИИ">
        <PromptStep ai={ai} hasAnswer={ai.answer.trim().length > 0} />
      </Step>
      <Step n={2} title="Ответ ИИ">
        <AnswerStep ai={ai} />
      </Step>
      <ReviewStep ai={ai} />
    </div>
  );
}
