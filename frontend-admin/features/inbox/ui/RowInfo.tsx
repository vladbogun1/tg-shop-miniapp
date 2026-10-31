import { StatusBadge } from "@/components/ui/Badge";
import { money } from "@shop/core/money";
import type { OrderStatus } from "@shop/core/types";
import type { InboxItem } from "../model/types";
import { WaitChip } from "./WaitChip";

const ORDER_STATUSES = new Set(["NEW", "APPROVED", "SHIPPED", "DELIVERED", "REJECTED"]);

function RowBadges({ item }: { item: InboxItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.shortId && (
        <span className="font-display tabular inline-flex h-[22px] items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 text-[12px] font-semibold tracking-[0.02em] text-[var(--text)]">
          #{item.shortId}
        </span>
      )}
      {item.status && ORDER_STATUSES.has(item.status) && <StatusBadge status={item.status as OrderStatus} />}
      {item.since && <WaitChip minutes={item.waitMinutes} overdue={item.overdue} />}
      {item.unread != null && item.unread > 0 && (
        <span className="count-badge" title="Непрочитанные сообщения">
          {item.unread > 99 ? "99+" : item.unread}
        </span>
      )}
    </div>
  );
}

/** What + which + how long. Clicking it does the main action, like the button. */
export function RowInfo({ item, onPrimary }: { item: InboxItem; onPrimary: (item: InboxItem) => void }) {
  return (
    <button type="button" onClick={() => onPrimary(item)} className="focusable min-w-0 flex-1 rounded-[var(--r-sm)] text-left">
      <RowBadges item={item} />
      <div className="mt-1.5 truncate text-[15px] font-semibold text-[var(--text)]">{item.title}</div>
      {item.subtitle && (
        <div className="mt-0.5 line-clamp-2 break-words text-[13px] leading-snug text-[var(--text-muted)]">{item.subtitle}</div>
      )}
      {item.amountMinor != null && (
        <div className="mt-1 text-[13px] text-[var(--text-muted)]">
          <b className="font-display tabular font-bold text-[var(--ink)]">{money(item.amountMinor)}</b>
          {item.amountNote && <span> · {item.amountNote}</span>}
        </div>
      )}
    </button>
  );
}
