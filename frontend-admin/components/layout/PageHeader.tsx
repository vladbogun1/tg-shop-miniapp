import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3 lg:mb-5", className)}>
      <div>
        {/* On a phone the shell's top bar already shows the title — no second one (kept for screen readers). */}
        <h1 className="max-lg:sr-only text-[26px] font-black uppercase tracking-wide text-[var(--text)]">{title}</h1>
        {subtitle && <p className="text-[13px] font-medium leading-snug text-[var(--text-muted)] lg:mt-1 lg:text-[14px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
