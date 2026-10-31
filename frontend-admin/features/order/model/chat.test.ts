import { describe, expect, it } from "vitest";
import type { OrderMessage } from "../api";
import { appendMessage, markCustomerRead, mergeOlder, unreadFromCustomer } from "./chat";

const msg = (id: number, over: Partial<OrderMessage> = {}): OrderMessage =>
  ({ id, senderType: "CUSTOMER", readAt: null, createdAt: "2026-10-31T10:00:00Z", ...over }) as OrderMessage;

describe("appendMessage", () => {
  it("добавляет в хвост", () => {
    expect(appendMessage([msg(1)], msg(2)).map((m) => m.id)).toEqual([1, 2]);
  });
  it("повтор того же id не дублируется и возвращает тот же список", () => {
    const prev = [msg(1)];
    expect(appendMessage(prev, msg(1))).toBe(prev);
  });
  it("пустой кэш — один элемент", () => {
    expect(appendMessage(undefined, msg(5))).toHaveLength(1);
  });
});

describe("markCustomerRead", () => {
  const now = "2026-10-31T12:00:00Z";
  it("отмечает только непрочитанные сообщения покупателя", () => {
    const out = markCustomerRead([msg(1), msg(2, { senderType: "ADMIN" }), msg(3, { readAt: "x" })], now);
    expect(out.map((m) => m.readAt)).toEqual([now, null, "x"]);
  });
  it("нечего менять — тот же массив", () => {
    const prev = [msg(1, { readAt: "x" })];
    expect(markCustomerRead(prev, now)).toBe(prev);
  });
});

describe("mergeOlder / unread", () => {
  it("старые страницы впереди и без дублей", () => {
    expect(mergeOlder([msg(3), msg(4)], [msg(1), msg(2), msg(3)]).map((m) => m.id)).toEqual([1, 2, 3, 4]);
    const latest = [msg(1)];
    expect(mergeOlder(latest, [])).toBe(latest);
  });
  it("счётчик непрочитанных от покупателя", () => {
    expect(unreadFromCustomer([msg(1), msg(2, { readAt: "x" }), msg(3, { senderType: "ADMIN" })])).toBe(1);
    expect(unreadFromCustomer(undefined)).toBe(0);
  });
});
