"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { STEPS } from "../../model/steps";

type State = "done" | "cur" | "next";
const stateOf = (i: number, step: number): State => (i < step ? "done" : i === step ? "cur" : "next");

const BAR: Record<State, string> = {
  done: "bg-[rgba(255,102,0,.45)] group-hover:bg-[rgba(255,102,0,.6)]",
  cur: "bg-[var(--accent)] shadow-[var(--glow-sm)]",
  next: "bg-[var(--surface-3)] group-hover:bg-[var(--border-2)]",
};
const CAP: Record<State, string> = {
  done: "text-[var(--text-muted)]",
  cur: "text-[var(--ink)]",
  next: "text-[var(--text-faint)] group-hover:text-[var(--text)]",
};

/**
 * Шаги мастера: полоски, которые можно нажать, и подпись под каждой — видно, куда переходишь. На ПК подписаны все
 * шаги; на телефоне места нет — подписан текущий, рядом «дальше: …», по нажатию раскрывается список шагов.
 * Под заголовком — одна строка, что делают на этом шаге.
 */
export function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const [list, setList] = useState(false);
  const cur = STEPS[step];
  const next = STEPS[step + 1];
  const jump = (i: number) => {
    setList(false);
    onJump(i);
  };
  return (
    <div className="w-full">
      <nav aria-label="Шаги" className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {STEPS.map((s, i) => {
          const st = stateOf(i, step);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => jump(i)}
              // Подсказка — описанием (title), не в имени: иначе «Описание» в подсказке шага путает поиск поля по подписи.
              aria-label={`Шаг ${i + 1}: ${s.label}`}
              aria-current={st === "cur" ? "step" : undefined}
              title={`${s.label} — ${s.hint}`}
              className="focusable group flex min-w-0 flex-col gap-1.5 rounded-[var(--r-sm)] pt-1.5 pointer-coarse:min-h-10 pointer-coarse:justify-center pointer-coarse:pt-0"
            >
              <span className={cn("h-1 w-full rounded-full transition-[background-color,box-shadow] duration-200", BAR[st])} />
              <span className={cn("hidden truncate text-left font-display text-[11px] font-semibold leading-[1.2] transition-colors sm:block", CAP[st])}>
                {s.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-3 flex items-baseline justify-between gap-3 sm:mt-2.5">
        <span className="section-title min-w-0 truncate !text-[15px] text-[var(--ink)]">
          {step + 1}. {cur.label}
        </span>
        <span className="hidden min-w-0 truncate text-[12.5px] text-[var(--text-muted)] sm:block">{cur.hint}</span>
        <button
          type="button"
          onClick={() => setList((v) => !v)}
          aria-expanded={list}
          className="focusable inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] text-[12px] text-[var(--text-muted)] sm:hidden"
        >
          {next ? <>дальше: {next.label} ·</> : null}
          <span className="tabular font-display font-semibold tracking-[0.06em] text-[var(--text-faint)]">
            {step + 1}/{STEPS.length}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", list && "rotate-180")} />
        </button>
      </div>
      <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)] sm:hidden">{cur.hint}</p>
      {list && (
        <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
          {STEPS.map((s, i) => {
            const st = stateOf(i, step);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => jump(i)}
                className={cn(
                  "focusable rounded-[var(--r-sm)] bg-[var(--surface-2)] px-2 py-1.5 font-display text-[11.5px] font-semibold",
                  st === "cur" ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]" : st === "done" ? "text-[var(--text-faint)]" : "text-[var(--text-muted)]"
                )}
              >
                {i + 1}. {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
