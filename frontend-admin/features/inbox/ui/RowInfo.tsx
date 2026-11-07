import { StatusBadge } from "@/components/ui/Badge";
import { money } from "@shop/core/money";
import { isOrderStatus } from "@shop/core/orders";
import type { InboxItem } from "../model/types";
import { groupIcon, groupTone, toneTile } from "./group-style";
import { WaitChip } from "./WaitChip";

/** Group icon tile; the unread count sits on it as a badge (chats), so it takes no place in the text. */
export function RowIcon({ item }: { item: InboxItem }) {
  const Icon = groupIcon(item.type);
  const unread = item.unread != null && item.unread > 0 ? item.unread : 0;
  return (
    <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border" style={toneTile(groupTone(item.type))}>
      <Icon className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="count-badge absolute -right-1.5 -top-1.5" title="Непрочитанные сообщения">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </div>
  );
}

export function ShortId({ id }: { id: string }) {
  return (
    <span className="font-display tabular inline-flex h-[22px] shrink-0 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 text-[12px] font-semibold tracking-[0.02em] text-[var(--text)]">
      #{id}
    </span>
  );
}

/** «3 290 ₴ · онлайн-предоплата». */
export function RowAmount({ item }: { item: InboxItem }) {
  if (item.amountMinor == null) return null;
  return (
    <span className="shrink-0 text-[var(--text-muted)]">
      <b className="font-display tabular font-bold text-[var(--ink)]">{money(item.amountMinor)}</b>
      {item.amountNote && <span> · {item.amountNote}</span>}
    </span>
  );
}

/**
 * Two lines (laptop / tablet). Line 1: `#id` + title … how long it waits. Line 2: subtitle · amount · status.
 * Clicking it does the main action, like the button next to it.
 */
export function RowInfo({ item, onPrimary }: { item: InboxItem; onPrimary: (item: InboxItem) => void }) {
  return (
    <button type="button" onClick={() => onPrimary(item)} className="focusable flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r-sm)] text-left">
      <RowIcon item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          {item.shortId && <ShortId id={item.shortId} />}
          <span className="truncate text-[14.5px] font-semibold text-[var(--text)]" title={item.title}>
            {item.title}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-x-2.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
          {item.subtitle && (
            <span className="min-w-0 truncate" title={item.subtitle}>
              {item.subtitle}
            </span>
          )}
          <RowAmount item={item} />
          {item.status && isOrderStatus(item.status) && <StatusBadge status={item.status} className="shrink-0" />}
        </span>
      </span>
      {item.since && <WaitChip minutes={item.waitMinutes} overdue={item.overdue} />}
    </button>
  );
}
