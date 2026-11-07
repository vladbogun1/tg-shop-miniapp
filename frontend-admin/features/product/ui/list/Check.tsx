"use client";

import { cn } from "@/lib/cn";

/** Галочка выбора строки (своя зона нажатия 32 px, чтобы не открывать редактор промахом). */
export function Check({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <label className="-m-2 grid cursor-pointer place-items-center p-2" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={label}
        title={label}
        className={cn("h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]", className)}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
