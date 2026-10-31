"use client";

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={"tabular font-display text-[14px] font-bold " + (accent ? "text-[var(--accent-hi)]" : "text-[var(--ink)]")}>{value}</div>
    </div>
  );
}
