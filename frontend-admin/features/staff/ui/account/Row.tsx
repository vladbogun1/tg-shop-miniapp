import type { ReactNode } from "react";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-b-0">
      <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold text-[var(--text)]">{children}</span>
    </div>
  );
}
