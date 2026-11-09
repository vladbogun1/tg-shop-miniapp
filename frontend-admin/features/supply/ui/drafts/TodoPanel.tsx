"use client";

/** «Что осталось»: прогресс по строкам и ссылки-прыжки к местам, где ещё нужно решить; липкая панель «Принять» внизу. */
import { Button } from "@shop/ui/admin-button";
import { Check } from "lucide-react";
import { jumpTo, type Todo } from "./review";

export function TodoPanel({ done, total, todos }: { done: number; total: number; todos: Todo[] }) {
  const share = total > 0 ? done / total : 0;
  return (
    <div className="card mb-6 min-w-0 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-bold text-[var(--text)]">
          Готово {done} из {total}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <div className="h-full origin-left rounded-full bg-[var(--accent)] transition-transform duration-300" style={{ transform: `scaleX(${share})` }} />
      </div>
      {todos.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--ok)]">Всё решено — можно принимать.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[var(--text-muted)]">Осталось:</span>
          {todos.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => jumpTo(t.anchor)}
              className="rounded-full border border-[var(--warn)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]"
            >
              {t.label} →
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Липкая нижняя панель: что осталось и большая «Принять». Не готово — кнопка не серая, а ведёт к первому нерешённому. */
export function AcceptBar({ todos, saving, pending, onAccept }: { todos: Todo[]; saving: boolean; pending: boolean; onAccept: () => void }) {
  const ready = todos.length === 0;
  return (
    <div className="elevated sticky bottom-[calc(var(--bottom-nav)+12px)] z-20 mb-6 mt-2 flex min-w-0 items-center gap-3 px-3 py-2 sm:gap-4 sm:py-2.5">
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug sm:text-[13px]">
        {ready ? <span className="font-semibold text-[var(--ok)]">Всё решено</span> : <span className="font-semibold text-[var(--warn)]">Осталось: {todos[0].label}{todos.length > 1 ? ` и ещё ${todos.length - 1}` : ""}</span>}
        <span className="hidden text-[12px] text-[var(--text-faint)] sm:inline"> · {saving ? "сохраняю правки…" : "правки сохранены"}</span>
      </div>
      <Button variant="accent" size="lg" icon={<Check className="h-4 w-4" />} loading={pending} onClick={onAccept} className="shrink-0">
        Принять
      </Button>
    </div>
  );
}
