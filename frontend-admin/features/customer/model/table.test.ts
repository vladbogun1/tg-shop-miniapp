import { describe, expect, it } from "vitest";
import { hasNextPage, parseMobileSort, toggleSorting } from "./table";

describe("сортировка списка пользователей", () => {
  it("тот же столбец меняет направление, другой начинает с убывания", () => {
    expect(toggleSorting({ sortBy: "createdAt", sortDir: "desc" }, "createdAt")).toEqual({ sortBy: "createdAt", sortDir: "asc" });
    expect(toggleSorting({ sortBy: "createdAt", sortDir: "asc" }, "createdAt")).toEqual({ sortBy: "createdAt", sortDir: "desc" });
    expect(toggleSorting({ sortBy: "createdAt", sortDir: "asc" }, "ordersCount")).toEqual({ sortBy: "ordersCount", sortDir: "desc" });
  });
  it("разбор значения мобильного select", () => {
    expect(parseMobileSort("username:asc")).toEqual({ sortBy: "username", sortDir: "asc" });
  });
  it("следующая страница есть, если текущая полная", () => {
    expect(hasNextPage(29)).toBe(false);
    expect(hasNextPage(30)).toBe(true);
  });
});

describe("подписи списка", () => {
  it("shownLabel: загружено столько-то или все", async () => {
    const { shownLabel, sortLabel } = await import("./table");
    expect(shownLabel(30, true)).toBe("Показано 30");
    expect(shownLabel(12, false)).toBe("Показаны все: 12");
    expect(sortLabel({ sortBy: "nope" as never, sortDir: "asc" })).toBe("Сортировка");
  });
});
