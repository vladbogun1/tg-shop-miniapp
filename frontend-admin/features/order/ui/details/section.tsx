"use client";

/** Мелкие кирпичи вкладки «Детали»: секция, строка с иконкой, ссылка на другой заказ, кнопка количества. */
import type { ReactNode } from "react";

export function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[14px] text-[var(--text)]">
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionAction({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit flex items-center gap-1 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline"
    >
      {icon}
      {children}
    </button>
  );
}

export function QtyBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nb-press hit grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** «#1a2b3c4d» that opens that order in the same drawer (plain text without a handler). */
export function OrderLink({ id, onOpen }: { id: string; onOpen?: (id: string) => void }) {
  const label = `#${id.slice(0, 8)}`;
  if (!onOpen) return <span className="tabular font-semibold text-[var(--text)]">{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="tabular hit font-semibold text-[var(--accent-hi)] hover:underline"
    >
      {label}
    </button>
  );
}
