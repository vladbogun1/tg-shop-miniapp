"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { hasGroupAction } from "../model/inbox";
import type { InboxOrderSlot } from "../model/order-slot";
import type { InboxGroup, InboxItem, SnoozePreset } from "../model/types";
import { GroupAction } from "./GroupAction";
import { groupIcon, groupTone, toneTile } from "./group-style";
import { InboxRow } from "./InboxRow";

/** Rows shown per group before «Показать ещё». */
const COLLAPSED = 5;

function GroupHeader({ group, order }: { group: InboxGroup; order: InboxOrderSlot }) {
  const Icon = groupIcon(group.id);
  const tone = groupTone(group.id);
  return (
    <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border" style={toneTile(tone)}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display flex items-center gap-2 text-[15px] font-bold uppercase leading-tight tracking-[0.04em] text-[var(--ink)]">
          {group.title}
          <span className="count-badge" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}>
            {group.count}
          </span>
        </h2>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
          {group.hint}
          {group.snoozed > 0 && <span className="text-[var(--text-faint)]"> · отложено: {group.snoozed}</span>}
        </p>
      </div>
      {hasGroupAction(group) && (
        <div className="w-full pl-12 sm:w-auto sm:pl-0">
          <GroupAction group={group} order={order} />
        </div>
      )}
    </header>
  );
}

export function GroupSection({
  group,
  order,
  index,
  isDesktop,
  siteBusy,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  group: InboxGroup;
  order: InboxOrderSlot;
  index: number;
  isDesktop: boolean;
  siteBusy: boolean;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.items : group.items.slice(0, COLLAPSED);
  const hidden = group.items.length - shown.length;

  return (
    <motion.section
      id={`inbox-${group.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-[88px]"
    >
      <GroupHeader group={group} order={order} />

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {shown.map((item) => (
            <InboxRow
              key={item.key}
              item={item}
              dismissible={group.dismissible}
              isDesktop={isDesktop}
              busy={item.type === "SITE_ERROR" && siteBusy}
              onPrimary={onPrimary}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </ul>

      {(hidden > 0 || expanded) && group.items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focusable nb-press font-display mt-3 h-10 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
        >
          {expanded ? "Свернуть" : `Показать ещё ${hidden}`}
        </button>
      )}
    </motion.section>
  );
}
