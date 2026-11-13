"use client";

/** Мелкие общие части окон Новой Почты: плашка-предупреждение, чип выбора, бейдж стадии. */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { stageLabel, stageTone } from "../model/labels";

export function Notice({ tone, title, items, children }: { tone: "danger" | "warn"; title?: string; items?: string[]; children?: ReactNode }) {
  const danger = tone === "danger";
  return (
    <div
      role={danger ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-[var(--r-md)] border px-3 py-2.5 text-[13px]",
        danger
          ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
          : "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]",
      )}
    >
      <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", danger ? "text-[var(--danger)]" : "text-[var(--warn)]")} />
      <div className="min-w-0 break-words text-[var(--text)]">
        {title && <b className={cn("block font-semibold", danger && "text-[var(--danger-ink)]")}>{title}</b>}
        {items && (
          <ul className="list-disc pl-4">
            {items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </div>
  );
}

export function Chip({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!active}
      className={cn(
        "focusable nb-press min-h-8 max-w-full rounded-full border px-3 py-1 text-left text-[12px] font-semibold transition-colors pointer-coarse:min-h-10 disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

/** Стадия посылки НП цветным бейджем (доска, таблица, «К отправке», карточка заказа). */
export function ShipmentStageBadge({ stage, className }: { stage: string | null | undefined; className?: string }) {
  if (!stage) return null;
  return (
    <Badge tone={stageTone(stage)} dot className={className}>
      {stageLabel(stage)}
    </Badge>
  );
}
