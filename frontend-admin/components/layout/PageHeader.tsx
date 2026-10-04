import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Screen heading: Exo 2 800 caps title (desktop; on a phone the top bar shows it) + muted subtitle + actions. */
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
        <h1 className="page-title max-lg:sr-only text-[26px] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] leading-snug text-[var(--text-muted)] lg:mt-1 lg:text-[14px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
