import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";

export const CELL =
  "h-9 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] disabled:opacity-60";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="section-title !text-[13px] text-[var(--ink)]">{children}</h3>;
}

export function FlagCard({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[var(--r-md)] border bg-[var(--surface-2)] p-3",
        warn ? "border-[color-mix(in_srgb,var(--warn)_45%,transparent)]" : "border-[var(--line)]"
      )}
    >
      {children}
    </div>
  );
}

export function FlagHint({ children }: { children: React.ReactNode }) {
  return <span className="pl-14 text-[12px] leading-snug text-[var(--text-faint)]">{children}</span>;
}

export function AddLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focusable hit font-display flex items-center gap-1 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] transition-colors hover:underline"
    >
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

export function MiniBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function RemoveBtn({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]",
        className
      )}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function Errors({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--danger-ink)]">
      {list.slice(0, 4).map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <X className="h-3 w-3 shrink-0" />
          {e}
        </li>
      ))}
      {list.length > 4 && <li>…и ещё {list.length - 4}</li>}
    </ul>
  );
}
