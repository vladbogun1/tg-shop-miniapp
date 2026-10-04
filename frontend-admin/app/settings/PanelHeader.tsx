import type { LucideIcon } from "lucide-react";

/** Icon tile + title + one-line hint, as on the «Оплата» page. */
export function PanelHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">{title}</h2>
        {description && <p className="text-[12px] text-[var(--text-muted)]">{description}</p>}
      </div>
    </div>
  );
}
