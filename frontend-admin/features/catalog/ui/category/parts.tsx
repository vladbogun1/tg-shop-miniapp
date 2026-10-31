import { cn } from "@/lib/cn";

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
      <div className="field-label !text-[10.5px] !text-[var(--text-faint)]">{label}</div>
      <div className="font-display tabular mt-0.5 truncate text-[15px] font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
}

export function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-md)] border p-2.5 text-[12.5px] leading-snug text-[var(--text)]",
        warn
          ? "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      )}
    >
      {children}
    </div>
  );
}

export function RowBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors disabled:opacity-25 pointer-coarse:h-10 pointer-coarse:w-10",
        danger
          ? "enabled:hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] enabled:hover:text-[var(--danger-ink)]"
          : "enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
