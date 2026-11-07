"use client";

import { timeAgo } from "@shop/core/time";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { uahFromMinor } from "../model/format";
import type { TaskRowView } from "../model/task-center";

/** Строка центра задач: что, кто и когда, итог чипом; сумма — только если сервер её прислал (финансист). */
export function AiTaskRow({ view, selected, onOpen }: { view: TaskRowView; selected: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="ai-task-row"
      aria-current={selected || undefined}
      className={cn(
        "nb-press flex w-full min-w-0 items-center gap-3 rounded-[var(--r-md)] border bg-[var(--surface)] px-3 py-2.5 text-left",
        selected ? "border-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-semibold text-[var(--ink)]">{view.title}</span>
        <span className="truncate text-[12px] text-[var(--text-muted)]">
          {view.admin} · {view.stepText ?? timeAgo(view.when)}
          {view.stale && <span className="text-[var(--warn)]"> · может устареть</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={view.tone}>{view.stateLabel}</Badge>
        {view.costMinor != null && <span className="text-[11.5px] tabular-nums text-[var(--text-faint)]">{uahFromMinor(view.costMinor)}</span>}
      </span>
    </button>
  );
}
