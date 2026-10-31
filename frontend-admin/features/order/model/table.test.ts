import { describe, expect, it } from "vitest";
import { nextSort, STATUS_FILTER_OPTIONS } from "./table";

describe("nextSort", () => {
  it("повторный клик меняет направление", () => {
    expect(nextSort({ sortBy: "createdAt", sortDir: "desc" }, "createdAt")).toEqual({ sortBy: "createdAt", sortDir: "asc" });
    expect(nextSort({ sortBy: "createdAt", sortDir: "asc" }, "createdAt")).toEqual({ sortBy: "createdAt", sortDir: "desc" });
  });

  it("другая колонка — по убыванию", () => {
    expect(nextSort({ sortBy: "createdAt", sortDir: "asc" }, "totalMinor")).toEqual({ sortBy: "totalMinor", sortDir: "desc" });
  });
});

describe("STATUS_FILTER_OPTIONS", () => {
  it("«Все» первым, дальше все статусы", () => {
    expect(STATUS_FILTER_OPTIONS[0]).toEqual({ value: "ALL", label: "Все" });
    expect(STATUS_FILTER_OPTIONS.length).toBeGreaterThan(4);
  });
});
