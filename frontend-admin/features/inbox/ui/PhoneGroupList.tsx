"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatWait, groupPreview } from "../model/inbox";
import type { InboxGroup } from "../model/types";
import { groupIcon, groupTone, toneTile } from "./group-style";

/**
 * Phone, screen 1: the groups as a chat list (variant B). An entry shows the group's first row, the
 * longest wait and the count; a group with an overdue row has a red count and a red wait — the urgent
 * thing is visible without opening anything.
 */
export function PhoneGroupList({ groups, onOpen }: { groups: InboxGroup[]; onOpen: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((g) => {
        const Icon = groupIcon(g.id);
        const tone = groupTone(g.id);
        const { line, waitMinutes, overdue } = groupPreview(g);
        return (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onOpen(g.id)}
              className="card card-hover focusable nb-press flex min-h-[64px] w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border" style={toneTile(tone)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-display truncate text-[15px] font-bold uppercase tracking-[0.03em] text-[var(--ink)]">{g.title}</span>
                {line && <span className="truncate text-[12.5px] text-[var(--text-muted)]">{line}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {waitMinutes > 0 && (
                  <span className={cn("tabular text-[11.5px] font-semibold", overdue ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]")}>
                    {formatWait(waitMinutes)}
                  </span>
                )}
                <span className={cn("count-badge", overdue && "count-badge--danger")} aria-label={`${g.count}`}>
                  {g.count}
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
