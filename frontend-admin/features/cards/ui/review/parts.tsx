"use client";

import { ArrowRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { CardChange } from "../../model";

export function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="nb-press focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-35 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      {children}
    </button>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
        <h3 className="section-title !text-[12.5px] text-[var(--ink)]">{title}</h3>
        {aside && <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function EditedMark() {
  return (
    <span className="chip-tint !px-1.5 !text-[9.5px] !leading-[14px]" style={{ "--chip": "var(--accent-hi)" } as CSSProperties} title="Исправлено админом после импорта">
      правка
    </span>
  );
}

export function ScalarRow({
  label,
  change,
  current,
  fmt,
}: {
  label: string;
  change: CardChange<string> | undefined;
  current: string | null;
  fmt: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[13px]">
      <span className="field-label w-[86px] shrink-0 !text-[11px]">{label}</span>
      {change ? (
        <>
          <span className="text-[var(--text-faint)] line-through decoration-[var(--text-faint)]">{change.before ? fmt(change.before) : "—"}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <b className="text-[var(--text)]">{change.after ? fmt(change.after) : "—"}</b>
          {change.edited && <EditedMark />}
        </>
      ) : (
        <>
          <span className="text-[var(--text)]">{current ?? "—"}</span>
          <span className="text-[11.5px] text-[var(--text-faint)]">без изменений</span>
        </>
      )}
    </div>
  );
}
