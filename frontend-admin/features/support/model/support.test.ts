import { describe, expect, it } from "vitest";
import { appendUnique, canLoadOlder, markCustomerRead, mergeMessages, SUPPORT_CHAT_PAGE } from "./chat";
import {
  awaitingCount,
  closedLabel,
  customerOf,
  isWaiting,
  neighbourThreadId,
  searchWithoutThread,
  siteProductUrl,
  sortForFilter,
  sourceLabel,
  threadTopic,
  urgencyOf,
  waitingLabel,
  waitingMinutes,
} from "./thread";
import type { SupportMessage, SupportThread } from "./types";

const thread = (over: Partial<SupportThread> = {}): SupportThread =>
  ({ id: "t1", status: "OPEN", lastMessageAt: "2026-10-01T00:00:00Z", unreadCount: 0, createdAt: "2026-10-01T00:00:00Z", ...over }) as SupportThread;

const msg = (id: number, over: Partial<SupportMessage> = {}): SupportMessage =>
  ({ id, threadId: "t1", senderType: "CUSTOMER", type: "TEXT", createdAt: "2026-10-01T00:00:00Z", ...over }) as SupportMessage;

describe("support thread helpers", () => {
  it("closedLabel: открытый — null, закрытый — с указанием кто", () => {
    expect(closedLabel(thread())).toBeNull();
    expect(closedLabel(thread({ status: "CLOSED" }))).toBe("Закрыт");
    expect(closedLabel(thread({ status: "CLOSED", closedBy: "AUTO" }))).toBe("Закрыт автоматически");
    expect(closedLabel(thread({ status: "CLOSED", closedBy: "ADMIN" }))).toBe("Закрыт админом");
  });

  it("isWaiting: только открытый и с awaitingSince", () => {
    expect(isWaiting(thread({ awaitingSince: "x" }))).toBe(true);
    expect(isWaiting(thread())).toBe(false);
    expect(isWaiting(thread({ status: "CLOSED", awaitingSince: "x" }))).toBe(false);
  });

  it("threadTopic / customerOf: запасные подписи", () => {
    expect(threadTopic(thread({ productTitle: "Мышь", subject: "s" }))).toBe("Мышь");
    expect(threadTopic(thread({ subject: "s" }))).toBe("s");
    expect(threadTopic(thread())).toBe("Общий вопрос");
    expect(customerOf(thread({ customerName: "  Ира " }))).toBe("Ира");
    expect(customerOf(thread({ userId: 7 }))).toBe("#7");
    expect(customerOf(thread())).toBe("Клиент");
  });

  it("sourceLabel / siteProductUrl", () => {
    expect(sourceLabel("WEB")).toBe("Сайт");
    expect(sourceLabel(null)).toBe("Mini App");
    expect(siteProductUrl("a b")).toMatch(/\/uk\/product\/a%20b$/);
  });

  it("awaitingCount: ноль не показываем", () => {
    expect(awaitingCount({ count: 0 })).toBeUndefined();
    expect(awaitingCount(undefined)).toBeUndefined();
    expect(awaitingCount({ count: 3 })).toBe(3);
  });

  it("searchWithoutThread: убирает только thread", () => {
    expect(searchWithoutThread("?thread=1")).toBe("");
    expect(searchWithoutThread("?a=1&thread=2")).toBe("?a=1");
  });
});

describe("support chat helpers", () => {
  it("markCustomerRead: помечает только непрочитанные сообщения клиента, без изменений — тот же массив", () => {
    const prev = [msg(1), msg(2, { senderType: "ADMIN" }), msg(3, { readAt: "old" })];
    const next = markCustomerRead(prev, "NOW");
    expect(next.map((m) => m.readAt)).toEqual(["NOW", undefined, "old"]);
    expect(markCustomerRead(next, "LATER")).toBe(next);
  });

  it("appendUnique: повтор по id не добавляется", () => {
    const a = [msg(1)];
    expect(appendUnique(a, msg(1))).toBe(a);
    expect(appendUnique(a, msg(2)).map((m) => m.id)).toEqual([1, 2]);
    expect(appendUnique(undefined, msg(5)).map((m) => m.id)).toEqual([5]);
  });

  it("mergeMessages: старые страницы без дублей перед последней", () => {
    const merged = mergeMessages([msg(1), msg(2)], [msg(2), msg(3)]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
    const latest = [msg(3)];
    expect(mergeMessages([], latest)).toBe(latest);
  });

  it("canLoadOlder: нужна полная последняя страница и ещё не конец", () => {
    expect(canLoadOlder(SUPPORT_CHAT_PAGE, false)).toBe(true);
    expect(canLoadOlder(SUPPORT_CHAT_PAGE - 1, false)).toBe(false);
    expect(canLoadOlder(SUPPORT_CHAT_PAGE, true)).toBe(false);
  });
});

describe("очередь поддержки", () => {
  const NOW = new Date("2026-11-07T12:00:00Z").getTime();
  const waitingSince = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

  it("waitingMinutes и срочность по порогам 30 мин / 2 ч", () => {
    expect(waitingMinutes(thread(), NOW)).toBeNull();
    expect(waitingMinutes(thread({ awaitingSince: waitingSince(160) }), NOW)).toBe(160);
    expect(waitingMinutes(thread({ status: "CLOSED", awaitingSince: waitingSince(5) }), NOW)).toBeNull();
    expect(urgencyOf(null)).toBe("calm");
    expect(urgencyOf(29)).toBe("calm");
    expect(urgencyOf(30)).toBe("warn");
    expect(urgencyOf(119)).toBe("warn");
    expect(urgencyOf(120)).toBe("danger");
  });

  it("waitingLabel: минуты, часы, дни", () => {
    expect(waitingLabel(0)).toBe("ждёт меньше минуты");
    expect(waitingLabel(12)).toBe("ждёт 12 мин");
    expect(waitingLabel(160)).toBe("ждёт 2 ч 40 мин");
    expect(waitingLabel(120)).toBe("ждёт 2 ч");
    expect(waitingLabel(60 * 28)).toBe("ждёт 1 д 4 ч");
  });

  it("sortForFilter: «Ждут ответа» — дольше всех ждущие сверху, остальные как есть", () => {
    const a = thread({ id: "a", awaitingSince: waitingSince(10) });
    const b = thread({ id: "b", awaitingSince: waitingSince(90) });
    const c = thread({ id: "c" });
    expect(sortForFilter([a, c, b], "awaiting").map((t) => t.id)).toEqual(["b", "a", "c"]);
    const list = [a, c, b];
    expect(sortForFilter(list, "open")).toBe(list);
  });

  it("neighbourThreadId: шаг по списку, края не переходятся", () => {
    const ids = ["a", "b", "c"];
    expect(neighbourThreadId(ids, "a", 1)).toBe("b");
    expect(neighbourThreadId(ids, "c", 1)).toBe("c");
    expect(neighbourThreadId(ids, "a", -1)).toBe("a");
    expect(neighbourThreadId(ids, null, 1)).toBe("a");
    expect(neighbourThreadId(ids, "zzz", -1)).toBe("c");
    expect(neighbourThreadId([], "a", 1)).toBeNull();
  });
});
