import type { InboxGroup } from "../model/types";
import { groupIcon, groupTone } from "./group-style";

/** Jump list — on a phone the groups are a long scroll. */
export function GroupNav({ groups }: { groups: InboxGroup[] }) {
  return (
    <nav
      aria-label="Группы"
      className="thin-scroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-wrap lg:px-0"
    >
      {groups.map((g) => {
        const Icon = groupIcon(g.id);
        return (
          <a
            key={g.id}
            href={`#inbox-${g.id}`}
            className="nb-chip nb-press focusable inline-flex h-9 shrink-0 items-center gap-2 pl-3 pr-2 text-[11.5px] uppercase tracking-[0.06em] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: groupTone(g.id) }} />
            {g.title}
            <span className="count-badge count-badge--muted">{g.count}</span>
          </a>
        );
      })}
    </nav>
  );
}
