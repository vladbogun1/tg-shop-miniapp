"use client";

import { hasGroupAction, rowLimit, visibleRows } from "../model/inbox";
import type { InboxOrderSlot } from "../model/order-slot";
import type { InboxGroup, InboxItem, SnoozePreset } from "../model/types";
import { GroupAction } from "./GroupAction";
import { groupIcon, groupTone } from "./group-style";
import { InboxRow } from "./InboxRow";
import { ShowAllButton } from "./ShowAllButton";

/**
 * A thin divider instead of the old tile header: icon 16 px + title + count (one h2) + the group's hint
 * (the meaning of the group stays on the line, and in the tooltip when it is cut) + «отложено: N»
 * and the group's own control on the right.
 */
function GroupHeader({ group, order }: { group: InboxGroup; order: InboxOrderSlot }) {
  const Icon = groupIcon(group.id);
  const tone = groupTone(group.id);
  return (
    <header className="mb-2 flex min-h-8 items-center gap-2" title={group.hint}>
      <Icon className="h-4 w-4 shrink-0" style={{ color: tone }} />
      <h2 className="font-display flex shrink-0 items-center gap-2 text-[13px] font-bold uppercase leading-tight tracking-[0.05em] text-[var(--ink)]">
        {group.title}
        <span className="count-badge" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}>
          {group.count}
        </span>
      </h2>
      <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
        {group.hint}
        {group.snoozed > 0 && <span className="text-[var(--text-faint)]"> · отложено: {group.snoozed}</span>}
      </p>
      {hasGroupAction(group) && <GroupAction group={group} order={order} />}
    </header>
  );
}

export function GroupSection({
  group,
  order,
  expanded,
  siteBusy,
  onToggleExpanded,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  group: InboxGroup;
  order: InboxOrderSlot;
  expanded: boolean;
  siteBusy: boolean;
  onToggleExpanded: (id: string) => void;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  const limit = rowLimit(false);
  const shown = visibleRows(group.items, limit, expanded);
  const collapsible = group.items.length > limit + 1;

  return (
    <section id={`inbox-${group.id}`} className="scroll-mt-[calc(var(--hdr-h,61px)+68px)]">
      <GroupHeader group={group} order={order} />
      <ul className="flex flex-col gap-2">
        {shown.map((item) => (
          <InboxRow
            key={item.key}
            item={item}
            dismissible={group.dismissible}
            busy={item.type === "SITE_ERROR" && siteBusy}
            onPrimary={onPrimary}
            onSnooze={onSnooze}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
      {collapsible && <ShowAllButton total={group.items.length} expanded={expanded} onToggle={() => onToggleExpanded(group.id)} />}
    </section>
  );
}
