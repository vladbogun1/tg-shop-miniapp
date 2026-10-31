"use client";

import { GitMerge, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Aliases({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-[var(--text-faint)]">—</span>;
  const shown = list.slice(0, 4);
  return (
    <span className="flex flex-wrap gap-1" title={list.join(", ")}>
      {shown.map((a) => (
        <span key={a} className="rounded-[var(--r-sm)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[11.5px] text-[var(--text-muted)]">
          {a}
        </span>
      ))}
      {list.length > shown.length && <span className="px-1 text-[11.5px] text-[var(--text-faint)]">+{list.length - shown.length}</span>}
    </span>
  );
}

export function RowActions({ onEdit, onMerge, onDelete }: { onEdit: () => void; onMerge: () => void; onDelete: () => void }) {
  const btn =
    "focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-10 pointer-coarse:w-10";
  return (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" className={btn} aria-label="Изменить" title="Изменить" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" className={btn} aria-label="Объединить с…" title="Объединить с…" onClick={onMerge}>
        <GitMerge className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] hover:text-[var(--danger-ink)]")}
        aria-label="Удалить"
        title="Удалить"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
