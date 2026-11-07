/** «Показать все N» / «Свернуть» under a group; one button, the state is remembered by the screen. */
export function ShowAllButton({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="focusable nb-press font-display mt-2 h-10 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11"
    >
      {expanded ? "Свернуть" : `Показать все ${total}`}
    </button>
  );
}
