export function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-semibold text-[var(--text)]">{label}</div>
        {sub && <div className="text-[11px] text-[var(--text-faint)]">{sub}</div>}
      </div>
      <div className="font-display shrink-0 font-bold text-[var(--text)] mx-num">{value}</div>
    </div>
  );
}
