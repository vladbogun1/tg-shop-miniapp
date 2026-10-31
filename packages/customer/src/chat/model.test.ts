import { describe, expect, it } from "vitest";
import { fetchOlderOrNull, markSeen, CHAT_PAGE_SIZE, freshOlder, groupByDay, hasMoreHistory, hasUnreadFromShop, indexById } from "./model";

const m = (id: number, createdAt = "2026-10-20T10:00:00Z") => ({ id, createdAt });

describe("chat model", () => {
  it("полная страница значит, что история продолжается", () => {
    expect(hasMoreHistory(CHAT_PAGE_SIZE)).toBe(true);
    expect(hasMoreHistory(CHAT_PAGE_SIZE - 1)).toBe(false);
  });

  it("markSeen: повтор (POST + ws) не считается новым", () => {
    const seen = new Set([1]);
    expect(markSeen(seen, 1)).toBe(false);
    expect(markSeen(seen, 2)).toBe(true);
    expect(markSeen(seen, 2)).toBe(false);
  });

  it("freshOlder отбрасывает уже показанные и помечает новые", () => {
    const seen = new Set([3]);
    expect(freshOlder([m(1), m(2), m(3)], seen).map((x) => x.id)).toEqual([1, 2]);
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("groupByDay: группа на день, подпись от первого сообщения дня", () => {
    const list = [m(1, "2026-10-20T10:00:00"), m(2, "2026-10-20T11:00:00"), m(3, "2026-10-21T09:00:00"), m(4, "2025-10-21T09:00:00")];
    const days = groupByDay(list, (iso) => `L:${iso}`);
    expect(days.map((d) => d.msgs.map((x) => x.id))).toEqual([[1, 2], [3], [4]]);
    expect(days[0]?.label).toBe("L:2026-10-20T10:00:00");
  });

  it("indexById и hasUnreadFromShop", () => {
    expect(indexById([m(5)]).get(5)?.id).toBe(5);
    expect(hasUnreadFromShop([{ senderType: "CUSTOMER" }, { senderType: "ADMIN", readAt: "x" }])).toBe(false);
    expect(hasUnreadFromShop([{ senderType: "ADMIN", readAt: null }])).toBe(true);
  });
});

describe("fetchOlderOrNull", () => {
  it("отказ загрузки раньше не бросает наружу, а даёт null (кнопка останется, можно повторить)", async () => {
    const failing = () => Promise.reject(new Error("network"));
    await expect(fetchOlderOrNull(failing, 5)).resolves.toBeNull();
  });
  it("успех отдаёт страницу как есть", async () => {
    const page = [{ id: 1 }];
    await expect(fetchOlderOrNull(async (before) => (before === 5 ? page : []), 5)).resolves.toBe(page);
  });
});
