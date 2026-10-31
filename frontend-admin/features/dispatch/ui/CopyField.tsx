import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function CopyField({
  icon,
  label,
  value,
  href,
  mono,
  noCopy,
  wrap,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  noCopy?: boolean;
  /** Wrap instead of «…»: the branch / parcel-locker number sits at the very end of the name. */
  wrap?: boolean;
}) {
  return (
    <div className="card-2 flex min-w-0 items-center gap-2.5 px-3 py-2">
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{label}</div>
        {href ? (
          <a href={href} className={cn("block truncate text-[14px] font-semibold text-[var(--text)] hover:underline pointer-coarse:-my-2 pointer-coarse:py-2", mono && "tabular")}>
            {value}
          </a>
        ) : (
          <div className={cn(wrap ? "break-words leading-snug" : "truncate", "text-[14px] font-semibold text-[var(--text)]", mono && "tabular")} title={value}>
            {value}
          </div>
        )}
      </div>
      {!noCopy && value !== "—" && <CopyButton value={value} label={`Скопировать: ${label.toLowerCase()}`} />}
    </div>
  );
}
