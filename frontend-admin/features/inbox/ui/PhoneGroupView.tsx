"use client";

import { isOrderStatus } from "@shop/core/orders";
import { ChevronLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { hasGroupAction, rowLimit, visibleRows } from "../model/inbox";
import type { InboxOrderSlot } from "../model/order-slot";
import type { InboxGroup, InboxItem, SnoozePreset } from "../model/types";
import { GroupAction } from "./GroupAction";
import { groupIcon, groupTone, toneTile } from "./group-style";
import { PhoneActions } from "./RowActions";
import { RowAmount, RowIcon, ShortId } from "./RowInfo";
import { ShowAllButton } from "./ShowAllButton";
import { WaitChip } from "./WaitChip";

function PhoneCard({
  item,
  dismissible,
  busy,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  item: InboxItem;
  dismissible: boolean;
  busy: boolean;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  return (
    <li
      className={cn(
        "card flex list-none flex-col gap-2.5 p-3",
        item.overdue && "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] shadow-[inset_2px_0_0_var(--danger),var(--shadow-1)]"
      )}
    >
      <div className="flex items-start gap-3">
        <RowIcon item={item} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {item.shortId && <ShortId id={item.shortId} />}
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text)]">{item.title}</span>
          </div>
          {item.subtitle && <div className="line-clamp-2 break-words text-[13px] leading-snug text-[var(--text-muted)]">{item.subtitle}</div>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <RowAmount item={item} />
            {item.status && isOrderStatus(item.status) && <StatusBadge status={item.status} />}
            {item.since && <WaitChip minutes={item.waitMinutes} overdue={item.overdue} />}
          </div>
        </div>
      </div>
      <PhoneActions item={item} dismissible={dismissible} busy={busy} onPrimary={onPrimary} onSnooze={onSnooze} onDismiss={onDismiss} />
    </li>
  );
}

/**
 * Phone, screen 2: one group (variant B) — a sticky head with «‹», the title and the count, the hint,
 * then cards with a big main action. The system «Назад» returns to the list (see the screen).
 */
export function PhoneGroupView({
  group,
  order,
  expanded,
  siteBusy,
  onBack,
  onToggleExpanded,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  group: InboxGroup;
  order: InboxOrderSlot;
  expanded: boolean;
  siteBusy: boolean;
  onBack: () => void;
  onToggleExpanded: (id: string) => void;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  const Icon = groupIcon(group.id);
  const tone = groupTone(group.id);
  const limit = rowLimit(true);
  const shown = visibleRows(group.items, limit, expanded);

  return (
    <section id={`inbox-${group.id}`}>
      <header className="sticky top-[calc(var(--hdr-h,61px)+60px)] z-10 -mx-4 flex min-h-12 items-center gap-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к группам"
          className="focusable nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)]"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border" style={toneTile(tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display flex min-w-0 flex-1 items-center gap-2 text-[14px] font-bold uppercase leading-tight tracking-[0.04em] text-[var(--ink)]">
          <span className="truncate">{group.title}</span>
          <span className="count-badge shrink-0" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}>
            {group.count}
          </span>
        </h2>
        {hasGroupAction(group) && <GroupAction group={group} order={order} />}
      </header>

      <p className="mb-3 mt-3 text-[12.5px] leading-snug text-[var(--text-muted)]">
        {group.hint}
        {group.snoozed > 0 && <span className="text-[var(--text-faint)]"> · отложено: {group.snoozed}</span>}
      </p>

      <ul className="flex flex-col gap-3">
        {shown.map((item) => (
          <PhoneCard
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
      {group.items.length > limit + 1 && (
        <ShowAllButton total={group.items.length} expanded={expanded} onToggle={() => onToggleExpanded(group.id)} />
      )}
    </section>
  );
}
