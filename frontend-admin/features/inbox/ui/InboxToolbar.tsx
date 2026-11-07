"use client";

import { Button } from "@shop/ui/admin-button";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { groupsTotal } from "../model/inbox";
import type { InboxGroup } from "../model/types";
import { groupIcon, groupTone } from "./group-style";

const CHIP =
  "nb-chip nb-press focusable inline-flex h-9 shrink-0 snap-start items-center gap-2 px-3 text-[11.5px] uppercase tracking-[0.06em] transition-colors hover:border-[var(--line-strong)] pointer-coarse:h-11";

/**
 * One sticky line instead of the old header: group chips (anchors — NOT filters, an urgent group must
 * never disappear), «Отложено N» and the refresh icon. On a phone the groups are the screen itself,
 * so only the last two stay.
 */
export function InboxToolbar({
  groups,
  active,
  snoozed,
  phone,
  fetching,
  onRefresh,
}: {
  groups: InboxGroup[];
  active: string | null;
  snoozed: number;
  phone: boolean;
  fetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="sticky top-[var(--hdr-h,61px)] z-20 -mx-4 flex items-center gap-2 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-2 backdrop-blur-md lg:-mx-7 lg:px-7">
      {!phone && groups.length > 0 && (
        <nav aria-label="Группы" className="thin-scroll flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-current={active === null ? "true" : undefined}
            className={cn(CHIP, active === null && "nb-chip-active")}
          >
            Все
            <span className="count-badge count-badge--muted">{groupsTotal(groups)}</span>
          </button>
          {groups.map((g) => {
            const Icon = groupIcon(g.id);
            const current = active === g.id;
            return (
              <a
                key={g.id}
                href={`#inbox-${g.id}`}
                aria-current={current ? "true" : undefined}
                className={cn(CHIP, current && "nb-chip-active")}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: groupTone(g.id) }} />
                {g.title}
                <span className="count-badge count-badge--muted">{g.count}</span>
              </a>
            );
          })}
        </nav>
      )}
      <div className={cn("flex shrink-0 items-center gap-2", (phone || groups.length === 0) && "ml-auto")}>
        {snoozed > 0 && (
          <span
            className="chip-tint !h-9 !px-3 !text-[11px] pointer-coarse:!h-11"
            title="Отложенное вернётся само, когда подойдёт срок"
          >
            Отложено {snoozed}
          </span>
        )}
        <Button
          variant="surface"
          className="w-9 px-0 pointer-coarse:w-11"
          icon={<RotateCw className={cn("h-4 w-4", fetching && "animate-spin")} />}
          aria-label="Обновить"
          title="Обновить"
          onClick={onRefresh}
        />
      </div>
    </div>
  );
}
