import { describe, expect, it } from "vitest";
import { formatWait, hasGroupAction, isRefundRow, knownType, snoozedTotal, visibleGroups, withoutItem } from "./inbox";
import type { Inbox, InboxGroup, InboxItem } from "./types";

/** Необязательные поля сервер шлёт как null; в тестах они не нужны. */
const item = (key: string, type = "CHAT"): InboxItem =>
  ({ key, type, entityId: key, version: "v", title: key, waitMinutes: 0, overdue: false }) as InboxItem;
const group = (id: string, items: InboxItem[], snoozed = 0): InboxGroup => ({ id, title: id, hint: "", dismissible: true, count: items.length, snoozed, items });
const inbox = (groups: InboxGroup[]): Inbox => ({ generatedAt: "", total: groups.reduce((n, g) => n + g.items.length, 0), groups, newStaleHours: 1, approvedStaleHours: 1, returnsDays: 1 });

describe("inbox model", () => {
  it("knownType", () => {
    expect(knownType("CHAT")).toBe("CHAT");
    expect(knownType("NEW_KIND")).toBeNull();
  });
  it("isRefundRow", () => {
    const base = { type: "PAYMENT", version: "", subtitle: null };
    expect(isRefundRow({ ...base, version: "refund:1" })).toBe(true);
    expect(isRefundRow({ ...base, version: "paid:1", subtitle: "верните деньги" })).toBe(false);
    expect(isRefundRow({ ...base, subtitle: "Оплачен, но отменён — Верните деньги" })).toBe(true);
    expect(isRefundRow({ ...base, type: "CHAT", version: "refund:1" })).toBe(false);
  });
  it("withoutItem removes a row, counts snoozed, never goes below zero", () => {
    const a = item("a"), b = item("b");
    const r = withoutItem(inbox([group("CHAT", [a, b]), group("RETURN", [item("c", "RETURN")])]), a, true);
    expect(r.groups[0]).toMatchObject({ count: 1, snoozed: 1 });
    expect(r.groups[0]!.items).toEqual([b]);
    expect(r.total).toBe(2);
    expect(withoutItem(inbox([group("CHAT", [a])]), a, false).groups[0]!.snoozed).toBe(0);
    expect(withoutItem({ ...inbox([group("CHAT", [a])]), total: 0 }, a, false).total).toBe(0);
  });
  it("visibleGroups / snoozedTotal", () => {
    const i = inbox([group("CHAT", [], 2), group("RETURN", [item("c", "RETURN")], 1)]);
    expect(visibleGroups(i).map((g) => g.id)).toEqual(["RETURN"]);
    expect(snoozedTotal(i)).toBe(3);
    expect(snoozedTotal(undefined)).toBe(0);
  });
  it("hasGroupAction", () => {
    expect(hasGroupAction(group("CHAT", [item("a")]))).toBe(false);
    expect(hasGroupAction(group("CHAT", [item("a"), item("b")]))).toBe(true);
    expect(hasGroupAction(group("LOW_STOCK", []))).toBe(true);
    expect(hasGroupAction(group("REVIEW", []))).toBe(false);
  });
  it("formatWait", () => {
    expect(formatWait(0)).toBe("только что");
    expect(formatWait(12)).toBe("12 мин");
    expect(formatWait(185)).toBe("3 ч 5 мин");
    expect(formatWait(6 * 60 + 5)).toBe("6 ч");
    expect(formatWait(28 * 60)).toBe("1 дн 4 ч");
    expect(formatWait(4 * 24 * 60 + 60)).toBe("4 дн");
  });
});
