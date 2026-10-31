import { formatDayMonth, formatTime, now } from "@shop/core/time";
import { INBOX_TYPES, SNOOZE_OPTIONS, type Inbox, type InboxGroup, type InboxItem, type InboxType, type KnownInboxType, type SnoozePreset } from "./types";

export function knownType(type: InboxType): KnownInboxType | null {
  return (INBOX_TYPES as readonly string[]).includes(type) ? (type as KnownInboxType) : null;
}

/**
 * PAYMENT rows come in two flavours (the server tells them apart by the version prefix):
 * «Оплачен онлайн — подтвердите заказ» (`paid:…`) and «Оплачен, но отменён — верните деньги»
 * (`refund:…`). Falls back to the subtitle wording.
 */
export function isRefundRow(item: Pick<InboxItem, "type" | "version" | "subtitle">): boolean {
  if (item.type !== "PAYMENT") return false;
  if (item.version.startsWith("refund:")) return true;
  if (item.version.startsWith("paid:")) return false;
  return /верните деньги/i.test(item.subtitle ?? "");
}

/** The inbox without one row (optimistic snooze / dismiss). */
export function withoutItem(inbox: Inbox, item: InboxItem, snoozed: boolean): Inbox {
  let removed = 0;
  const groups = inbox.groups.map((g) => {
    if (g.id !== item.type) return g;
    const items = g.items.filter((it) => it.key !== item.key);
    removed = g.items.length - items.length;
    return { ...g, items, count: items.length, snoozed: g.snoozed + (snoozed ? removed : 0) };
  });
  return { ...inbox, groups, total: Math.max(0, inbox.total - removed) };
}

/** «до 15:30» today, «до 02.11 09:00» another day. */
export function untilLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now().toDateString();
  const time = formatTime(iso);
  return sameDay ? `до ${time}` : `до ${formatDayMonth(iso)} ${time}`;
}

/** Text of the «Отложено …» toast: the server's deadline if it sent one, else the preset's own label. */
export function snoozeLabel(until: string | null | undefined, preset: SnoozePreset): string | undefined {
  return until ? untilLabel(until) : SNOOZE_OPTIONS.find((o) => o.value === preset)?.label;
}

/** Groups that still have rows, in the server's order (most urgent first). */
export function visibleGroups(inbox: Inbox | undefined) {
  return (inbox?.groups ?? []).filter((g) => g.items.length > 0);
}

/** Rows hidden by «Отложить» across all groups. */
export function snoozedTotal(inbox: Inbox | undefined): number {
  return (inbox?.groups ?? []).reduce((n, g) => n + g.snoozed, 0);
}

/** «12 мин», «3 ч 5 мин», «2 дн 4 ч» — how long the row has been waiting. */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const m = minutes % 60;
    return m > 0 && h < 6 ? `${h} ч ${m} мин` : `${h} ч`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 && d < 3 ? `${d} дн ${rh} ч` : `${d} дн`;
}

/** Whether the group header carries an extra control (see GroupAction). */
export function hasGroupAction(group: Pick<InboxGroup, "id" | "items">): boolean {
  return (group.id === "CHAT" && group.items.length > 1) || group.id === "LOW_STOCK" || group.id === "SITE_ERROR";
}
